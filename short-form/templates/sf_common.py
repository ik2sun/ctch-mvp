# -*- coding: utf-8 -*-
"""CTCH 범용 숏폼 렌더 공용 모듈 — 폰트·이징·타이포·그라데이션·TTS(edge-tts)·합성 BGM·ffmpeg 인코딩.

템플릿 렌더 스크립트(photo_promo/render.py, veo_promo/render.py)가 import 한다.
입력은 SF_JOB(job.json) 하나로 받는다:
  { "script": {brand,title,scenes[],cta{},voice}, "assets": [로컬 이미지 경로...], "clips": {shot: 로컬 mp4}, "options": {...} }
출력 위치: SF_OUT(mp4), SF_WORK/poster.jpg, SF_WORK/stills_sheet.jpg
"""
import os, sys, json, math, wave, glob, subprocess, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

sys.stdout.reconfigure(encoding="utf-8")

W, H, FPS = 1080, 1920, 30
SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("SF_WORK", os.path.join(HERE, "_work"))
OUT = os.environ.get("SF_OUT", os.path.join(WORK, "out.mp4"))
FRAMES = os.environ.get("SF_FRAMES", os.path.join(WORK, "frames"))
FFMPEG = os.environ.get("SF_FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("SF_FFPROBE", "ffprobe")
os.makedirs(WORK, exist_ok=True)

# ---------------------------------------------------------------- job
def load_job():
    p = os.environ.get("SF_JOB")
    if not p or not os.path.exists(p):
        raise SystemExit("SF_JOB(job.json) 이 필요합니다.")
    job = json.load(open(p, encoding="utf-8"))
    job.setdefault("script", {}); job.setdefault("assets", []); job.setdefault("clips", {}); job.setdefault("options", {})
    sc = job["script"]
    sc.setdefault("scenes", []); sc.setdefault("cta", {}); sc.setdefault("brand", ""); sc.setdefault("voice", "ko-KR-InJoonNeural")
    if not sc["scenes"]:
        raise SystemExit("script.scenes 가 비어 있습니다.")
    return job

# ---------------------------------------------------------------- fonts
def _first(*cands):
    for c in cands:
        if c and os.path.exists(c):
            return c
    return None

UF = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Fonts")
SYS = r"C:\Windows\Fonts"
F_BLACK = _first(os.path.join(UF, "Pretendard-Black.otf"), os.path.join(SYS, "malgunbd.ttf"))
F_XB = _first(os.path.join(UF, "Pretendard-ExtraBold.otf"), os.path.join(SYS, "malgunbd.ttf"))
F_BOLD = _first(os.path.join(UF, "Pretendard-Bold.otf"), os.path.join(SYS, "malgunbd.ttf"))
F_MED = _first(os.path.join(UF, "Pretendard-Medium.otf"), os.path.join(SYS, "malgun.ttf"))
F_NUM = _first(os.path.join(UF, "GmarketSansTTFBold.ttf"), F_BLACK)
if not F_BOLD:
    raise SystemExit("한글 폰트를 찾지 못했습니다 (Pretendard 또는 맑은 고딕).")

_fc = {}
def font(p, s):
    k = (p, int(s))
    if k not in _fc:
        _fc[k] = ImageFont.truetype(p, int(s))
    return _fc[k]

# ---------------------------------------------------------------- easing
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease_out(t): t = clamp(t); return 1 - (1 - t) ** 3
def ease_in_out(t): t = clamp(t); return t * t * (3 - 2 * t)
def ease_back(t):
    t = clamp(t); c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
def lerp(a, b, t): return a + (b - a) * t

# ---------------------------------------------------------------- colors
WHITE = (255, 255, 255); INK = (24, 22, 20); SOFT = (232, 226, 218); MUTED = (170, 160, 150)
ACCENT = (235, 104, 52); ACCENT2 = (242, 184, 52); CREAM = (246, 242, 235)

def hex_rgb(s, default):
    try:
        s = s.strip().lstrip("#")
        return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        return default

# ---------------------------------------------------------------- image helpers
_mask = {}
def rounded_mask(w, h, r=44):
    k = (w, h, r)
    if k not in _mask:
        m = Image.new("L", (w, h), 0)
        ImageDraw.Draw(m).rounded_rectangle((0, 0, w - 1, h - 1), radius=r, fill=255)
        _mask[k] = m
    return _mask[k]

_shadow = {}
def shadow(w, h):
    k = (w, h)
    if k not in _shadow:
        pad = 60
        s = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
        ImageDraw.Draw(s).rounded_rectangle((pad, pad + 18, pad + w, pad + h + 18), radius=44, fill=(0, 0, 0, 130))
        _shadow[k] = s.filter(ImageFilter.GaussianBlur(24))
    return _shadow[k]

def cover(im, w, h, fx=0.5, fy=0.5, zoom=1.0):
    """im 을 w×h 로 덮도록 확대/크롭. (fx, fy) 는 초점(0~1), zoom>1 이면 더 확대."""
    s = max(w / im.width, h / im.height) * zoom
    bw, bh = max(w, int(im.width * s)), max(h, int(im.height * s))
    big = im.resize((bw, bh), Image.BILINEAR)
    x0 = int(clamp(fx * bw - w / 2, 0, bw - w)); y0 = int(clamp(fy * bh - h / 2, 0, bh - h))
    return big.crop((x0, y0, x0 + w, y0 + h))

_grad = {}
def gradient(c, top=True, h=700, alpha=170, color=(16, 12, 10)):
    k = (top, h, alpha, color)
    if k not in _grad:
        a = (np.linspace(1, 0, h) ** 1.6 * alpha).astype(np.uint8)
        if not top: a = a[::-1]
        layer = Image.new("RGBA", (W, H), color + (0,))
        m = Image.fromarray(np.repeat(a[:, None], W, axis=1), "L")
        full = Image.new("L", (W, H), 0); full.paste(m, (0, 0 if top else H - h))
        layer.putalpha(full); _grad[k] = layer
    c.alpha_composite(_grad[k])

def vignette(c, alpha=90):
    k = ("vig", alpha)
    if k not in _grad:
        yy, xx = np.mgrid[0:H, 0:W]
        d = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
        a = (np.clip((d - 0.55) / 0.75, 0, 1) ** 1.5 * alpha).astype(np.uint8)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0)); layer.putalpha(Image.fromarray(a, "L")); _grad[k] = layer
    c.alpha_composite(_grad[k])

# ---------------------------------------------------------------- text
def wrap(text, f, max_w, d=None):
    """\\n 이 있으면 존중, 없으면 max_w 에 맞춰 어절 단위로 줄바꿈. 한 어절이 너무 길면 글자 단위."""
    d = d or ImageDraw.Draw(Image.new("RGB", (8, 8)))
    def width(s): return d.textlength(s, font=f)
    out = []
    for para in text.split("\n"):
        words = para.split(" ")
        line = ""
        for w_ in words:
            cand = (line + " " + w_).strip()
            if width(cand) <= max_w or not line:
                if width(cand) > max_w and not line:
                    # 글자 단위 강제 분할
                    cur = ""
                    for ch in cand:
                        if width(cur + ch) > max_w and cur:
                            out.append(cur); cur = ch
                        else:
                            cur += ch
                    line = cur
                else:
                    line = cand
            else:
                out.append(line); line = w_
        if line: out.append(line)
    return out

def fit_font(text, path, size, max_w, min_size=40, max_lines=3):
    """max_w 안에 max_lines 줄 이하로 들어가는 최대 폰트 크기."""
    d = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    s = size
    while s > min_size:
        f = font(path, s)
        lines = wrap(text, f, max_w, d)
        if len(lines) <= max_lines and all(d.textlength(l, font=f) <= max_w for l in lines):
            return f, lines
        s -= 4
    f = font(path, min_size)
    return f, wrap(text, f, max_w, d)

def fade_text(d, xy, s, f, fill, prog, rise=20, anchor="mm", stroke=0, stroke_fill=(0, 0, 0)):
    if prog <= 0: return
    e = ease_out(prog)
    x, y = xy
    a = int(255 * e)
    d.text((x, y + (1 - e) * rise), s, font=f, fill=fill + (a,), anchor=anchor,
           stroke_width=stroke, stroke_fill=stroke_fill + (a,) if stroke else None)

def headline(d, y, text, size=96, prog=1.0, fill=WHITE, path=None, max_w=940, align="center", x=None, shadow_=True):
    """여러 줄 헤드라인. 줄마다 살짝 시차를 두고 떠오른다. y 는 블록 중심."""
    if prog <= 0: return 0
    path = path or F_XB
    f, lines = fit_font(text, path, size, max_w)
    lh = f.size * 1.2
    y0 = y - lh * (len(lines) - 1) / 2
    for i, ln in enumerate(lines):
        lp = clamp((prog - i * 0.12) / 0.5)
        if lp <= 0: continue
        e = ease_out(lp)
        a = int(255 * e)
        yy = y0 + i * lh + (1 - e) * 40
        if align == "center":
            xx, anchor = W / 2, "mm"
        else:
            xx, anchor = (x if x is not None else 80), "lm"
        if shadow_:
            d.text((xx + 3, yy + 5), ln, font=f, fill=(0, 0, 0, int(a * 0.45)), anchor=anchor)
        d.text((xx, yy), ln, font=f, fill=fill + (a,), anchor=anchor)
    return lh * len(lines)

def kicker(d, y, s, prog=1.0, fill=SOFT, size=28, align="center", x=None):
    if not s: return
    f = font(F_MED, size)
    letter = "  ".join(s) if s.isascii() and len(s) <= 14 else s
    if align == "center":
        fade_text(d, (W / 2, y), letter, f, fill, prog, rise=10)
    else:
        fade_text(d, (x if x is not None else 80, y), letter, f, fill, prog, rise=10, anchor="lm")

def subline(d, y, s, prog=1.0, fill=SOFT, size=38, max_w=940, align="center", x=None):
    if not s or prog <= 0: return
    f, lines = fit_font(s, F_MED, size, max_w, min_size=30, max_lines=2)
    lh = f.size * 1.25
    for i, ln in enumerate(lines):
        if align == "center":
            fade_text(d, (W / 2, y + i * lh), ln, f, fill, prog - i * 0.1, rise=16)
        else:
            fade_text(d, (x if x is not None else 80, y + i * lh), ln, f, fill, prog - i * 0.1, rise=16, anchor="lm")

def pill(d, xy, s, size=44, bg=ACCENT, fg=WHITE, prog=1.0, path=None, pad=(30, 16)):
    if not s or prog <= 0: return
    path = path or F_XB
    f = font(path, size)
    bb = d.textbbox((0, 0), s, font=f, anchor="lt")
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    bw, bh = tw + pad[0] * 2, th + pad[1] * 2
    sc = ease_back(prog); bw2, bh2 = bw * sc, bh * sc
    x, y = xy; x0, y0 = x - bw2 / 2, y - bh2 / 2
    d.rounded_rectangle((x0, y0, x0 + bw2, y0 + bh2), radius=bh2 / 2, fill=bg)
    if prog > 0.3:
        d.text((x0 + bw2 / 2, y0 + bh2 / 2), s, font=font(path, max(8, int(size * min(1, sc)))), fill=fg, anchor="mm")

def tag(d, xy, s, prog=1.0, size=32, fg=WHITE, line=SOFT, fill=None, pad=(26, 12)):
    if not s or prog <= 0: return
    e = ease_out(prog)
    f = font(F_BOLD, size)
    bb = d.textbbox((0, 0), s, font=f, anchor="lt")
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    bw, bh = tw + pad[0] * 2, th + pad[1] * 2
    x, y = xy; y = y + (1 - e) * 16
    a = int(255 * e)
    box = (x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2)
    if fill: d.rounded_rectangle(box, radius=bh / 2, fill=fill + (a,))
    d.rounded_rectangle(box, radius=bh / 2, outline=line + (a,), width=2)
    d.text((x, y), s, font=f, fill=fg + (a,), anchor="mm")

def rule(d, y, prog=1.0, half=90, fill=MUTED):
    if prog <= 0: return
    w_ = half * ease_out(prog)
    d.line((W / 2 - w_, y, W / 2 + w_, y), fill=fill, width=2)

def chevron(d, cx, cy, w_, h_, fill=ACCENT, width=12):
    d.line([(cx - w_ / 2, cy - h_ / 2), (cx, cy + h_ / 2), (cx + w_ / 2, cy - h_ / 2)], fill=fill, width=width, joint="curve")

def brand_mark(d, brand, y=150, prog=1.0, fill=SOFT):
    if not brand: return
    f = font(F_BOLD, 30)
    s = "  ".join(brand.upper()) if brand.isascii() and len(brand) <= 14 else brand
    fade_text(d, (W / 2, y), s, f, fill, prog, rise=8)

# ---------------------------------------------------------------- CTA end card
def end_card(c, d, t, dur, script, bg_img=None):
    """마지막 4초 엔드카드 — 배경(블러 이미지/클립 프레임) + 브랜드 + CTA 헤드라인 + 버튼 + 뱃지."""
    cta = script.get("cta") or {}
    if bg_img is not None:
        im = cover(bg_img, W, H, zoom=1.0 + 0.04 * t / max(dur, 0.1)).filter(ImageFilter.GaussianBlur(14))
        im = ImageEnhance.Brightness(im).enhance(0.45)
        c.paste(im, (0, 0))
    else:
        c.paste(Image.new("RGB", (W, H), INK), (0, 0))
    vignette(c, 110)
    pulse = 1 + 0.05 * math.sin(t * 8)
    pill(d, (W / 2, 330), cta.get("badge", ""), size=int(46 * pulse), prog=t / 0.35)
    brand_mark(d, script.get("brand", ""), y=560, prog=(t - 0.15) / 0.4)
    headline(d, 760, cta.get("headline") or script.get("brand", ""), size=100, prog=(t - 0.25) / 0.5)
    subline(d, 960, cta.get("sub", ""), prog=(t - 0.7) / 0.4, size=40)
    if t > 0.9:
        p = ease_back(clamp((t - 0.9) / 0.45))
        by = 1440 + (1 - p) * 200
        d.rounded_rectangle((90, by, W - 90, by + 220), radius=40, fill=WHITE)
        f, lines = fit_font(cta.get("sub") or "지금 확인하기", F_BLACK, 58, 820, min_size=40, max_lines=1)
        d.text((W / 2, by + 78), lines[0], font=f, fill=INK, anchor="mm")
        d.text((W / 2, by + 152), script.get("brand", ""), font=font(F_MED, 32), fill=(130, 120, 110), anchor="mm")
        bounce = abs(math.sin(t * 6)) * 22
        for k in range(3):
            a = 1 - k * 0.3
            col = tuple(int(lerp(255, ACCENT[i], a)) for i in range(3))
            chevron(d, W / 2, by + 205 + bounce + k * 18 - 40, 90, 34, fill=col, width=12)

# ---------------------------------------------------------------- TTS (edge-tts)
def tts(script, work=WORK):
    """script.scenes[].narration → work/tts/<id>.wav, 길이(초) dict. 이미 있으면 재사용."""
    voice = script.get("voice") or "ko-KR-InJoonNeural"
    d = os.path.join(work, "tts"); os.makedirs(d, exist_ok=True)
    durs = {}
    for sc in script["scenes"]:
        sid, text = sc["id"], (sc.get("narration") or "").strip()
        wav = os.path.join(d, sid + ".wav")
        if not text:
            durs[sid] = 0.0; continue
        if not os.path.exists(wav):
            mp3 = os.path.join(d, sid + ".mp3")
            cmd = [sys.executable, "-m", "edge_tts", "--voice", voice, "--rate", "+4%", "--text", text, "--write-media", mp3]
            r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            if r.returncode != 0 or not os.path.exists(mp3):
                raise RuntimeError(f"edge-tts 실패({sid}): {(r.stderr or r.stdout)[-400:]}")
            subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", mp3, "-ac", "1", "-ar", str(SR), wav], check=True)
        durs[sid] = probe_duration(wav)
    return durs

def probe_duration(path):
    out = subprocess.check_output([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(out.decode().strip() or 0)

def load_wav(p):
    with wave.open(p) as w_:
        a = np.frombuffer(w_.readframes(w_.getnframes()), dtype=np.int16).astype(np.float64) / 32768
        if w_.getnchannels() == 2: a = a.reshape(-1, 2).mean(1)
    return a

# ---------------------------------------------------------------- audio synth
def synth_audio(total, timeline, script, work=WORK, mood="warm"):
    """내레이션(tts) + 합성 BGM(패드·킥·플럭) + 장면 전환 whoosh → work/audio.wav
    timeline: [(scene_id, start, end), ...] (엔드카드는 id 'cta_end')"""
    n = int(total * SR) + SR
    mix = np.zeros(n); music = np.zeros(n); voice = np.zeros(n)
    rng = np.random.default_rng(7)

    def add(dst, sig, at, gain=1.0):
        i = int(at * SR); j = min(n, i + len(sig))
        if i < n and j > i: dst[i:j] += sig[: j - i] * gain
    def tone(freq, length, decay=0.3, harm=(1,)):
        t = np.arange(int(length * SR)) / SR
        s = sum(np.sin(2 * np.pi * freq * h * t) / (k + 1) for k, h in enumerate(harm))
        return s * np.exp(-t / decay)
    def noise(length, lp=1, decay=0.05):
        s = rng.standard_normal(int(length * SR))
        if lp > 1: s = np.convolve(s, np.ones(lp) / lp, mode="same")
        return s / (np.max(np.abs(s)) + 1e-9) * np.exp(-np.arange(len(s)) / SR / decay)
    def kick(soft=True):
        t = np.arange(int(0.3 * SR)) / SR
        f = (120 if soft else 150) * np.exp(-t * 20) + 48
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (12 if soft else 9))
    def whoosh(length=0.3):
        s = noise(length, lp=30, decay=10)
        t = np.arange(len(s)) / SR
        return s * np.sin(np.pi * t / length) ** 2
    def riser(length=1.2):
        t = np.arange(int(length * SR)) / SR
        f = 200 + 900 * (t / length) ** 2
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / length) * 0.5 + noise(length, lp=20, decay=10) * (t / length) ** 2 * 0.5
    def pluck(freq, length=0.5): return tone(freq, length, 0.18, harm=(1, 2, 3)) * 0.5
    def pad(freqs, length):
        t = np.arange(int(length * SR)) / SR
        s = np.zeros_like(t)
        for f in freqs: s += np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.005 * t)
        env = np.minimum(t / 0.4, 1) * np.minimum((length - t) / 0.4, 1)
        return s / len(freqs) * env

    # 후킹 구간: 저음 드론 + 심장박동 → 첫 전환에 riser
    hook_end = timeline[1][1] if len(timeline) > 1 else min(4.0, total)
    t = np.arange(int(hook_end * SR)) / SR
    add(mix, np.sin(2 * np.pi * 55 * t) * 0.22 * np.minimum(t / 1.0, 1) * np.minimum((hook_end - t) / 0.3, 1), 0)
    add(mix, riser(0.9), hook_end - 0.9, 0.45)

    bpm = 108 if mood == "warm" else 120
    beat = 60 / bpm; bar = beat * 4
    chords = [(261.6, 329.6, 392.0), (220.0, 261.6, 329.6), (174.6, 220.0, 261.6), (196.0, 246.9, 293.7)]
    b = hook_end; k = 0
    while b < total - 0.3:
        ch = chords[(k // 4) % 4]
        if k % 4 == 0: add(music, pad([f / 2 for f in ch], bar + 0.2), b, 0.20)
        add(music, kick(soft=True), b, 0.45 if k % 2 == 0 else 0.3)
        add(music, noise(0.05, lp=1, decay=0.015), b + beat / 2, 0.08)
        if k % 2 == 1: add(music, noise(0.12, lp=6, decay=0.04), b, 0.14)
        for j in range(2):
            f = ch[(k * 2 + j) % 3] * (2 if j == 1 else 1)
            add(music, pluck(f, beat), b + j * beat / 2, 0.14)
        b += beat; k += 1

    # 내레이션
    for sid, s0, _ in timeline:
        wav = os.path.join(work, "tts", sid + ".wav")
        if os.path.exists(wav):
            add(voice, load_wav(wav), s0 + 0.3, 1.0)
    env = np.convolve(np.abs(voice), np.ones(int(0.08 * SR)) / int(0.08 * SR), mode="same")
    music *= 1 - 0.6 * np.clip(env / 0.05, 0, 1)

    # 전환 효과음
    for sid, s0, _ in timeline[1:]:
        add(mix, whoosh(0.25), s0 - 0.05, 0.35)
        add(mix, kick(soft=False), s0 + 0.02, 0.5)
    add(mix, riser(1.0), total - 1.6, 0.3); add(mix, tone(1046, 1.5, 0.6, harm=(1, 2, 3)), total - 0.6, 0.25)

    tot = mix + music * 0.9 + voice * 1.15
    tot = np.tanh(tot * 1.1) * 0.95
    fo = int(0.6 * SR); tot[-fo:] *= np.linspace(1, 0, fo)
    path = os.path.join(work, "audio.wav")
    with wave.open(path, "wb") as w_:
        w_.setnchannels(1); w_.setsampwidth(2); w_.setframerate(SR)
        w_.writeframes((tot[: int(total * SR)] * 32767).astype(np.int16).tobytes())
    return path

# ---------------------------------------------------------------- timeline
def build_timeline(script, durs, kind):
    """장면별 (id, start, end). 장면 길이는 seconds(길이 옵션의 장면 계획)와 내레이션+0.9초 중 긴 쪽.
    seconds 가 없으면 clips 8초·photos 6초. 엔드카드는 script.endSeconds (없으면 4초)."""
    tl = []; t = 0.0
    for sc in script["scenes"]:
        d = durs.get(sc["id"], 0.0)
        want = float(sc.get("seconds") or (8 if kind == "clips" else 6))
        length = max(want, d + 0.9)
        tl.append((sc["id"], t, t + length)); t += length
    end = float(script.get("endSeconds") or 4.0)
    tl.append(("cta_end", t, t + end))
    return tl, t + end

# ---------------------------------------------------------------- encode
def encode(frame_fn, total, audio, out=OUT, stills_at=None, log_every=150):
    n = int(total * FPS)
    cmd = [FFMPEG, "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", audio, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(n):
        p.stdin.write(frame_fn(i).tobytes())
        if i % log_every == 0: print(f"frame {i}/{n}", flush=True)
    p.stdin.close(); p.wait()
    if p.returncode != 0:
        raise RuntimeError(f"ffmpeg 종료 코드 {p.returncode}")
    print("done", out, flush=True)
    save_stills(frame_fn, total, stills_at)

def save_stills(frame_fn, total, stills_at=None, poster_at=None):
    ts = stills_at or [total * k / 14 + 0.4 for k in range(14)]
    cols = 7; tw, th = 270, 480
    sheet = Image.new("RGB", (cols * tw, 2 * th), "black")
    for i, t in enumerate(ts[:14]):
        sheet.paste(frame_fn(int(min(t, total - 0.1) * FPS)).resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
    sheet.save(os.path.join(WORK, "stills_sheet.jpg"), quality=85)
    pt = poster_at if poster_at is not None else min(total - 0.1, ts[1] if len(ts) > 1 else 1.0)
    frame_fn(int(pt * FPS)).resize((540, 960), Image.LANCZOS).save(os.path.join(WORK, "poster.jpg"), quality=88)
