# -*- coding: utf-8 -*-
"""Le Mouton Week promo short, v2: Veo 3.1 background clips + v1 typography/audio.
1080x1920 @30fps. Run: python render_veo.py [--stills]
"""
import math, random, subprocess, sys, wave, os, json, glob
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

sys.stdout.reconfigure(encoding="utf-8")
random.seed(3)

W, H, FPS = 1080, 1920, 30
HERE = os.path.dirname(os.path.abspath(__file__))
# 외부(렌더 워커)에서 실행할 때는 SF_* 환경변수로 입력/출력 위치를 바꿀 수 있다. 기본은 이 폴더.
WORK = os.environ.get("SF_WORK", HERE)
CLIPS = os.environ.get("SF_CLIPS", os.path.join(HERE, "clips"))
FRAMES = os.environ.get("SF_FRAMES", os.path.join(WORK, "frames"))
OUT = os.environ.get("SF_OUT", os.path.join(WORK, "lemouton_week_veo.mp4"))
FFMPEG = os.environ.get("SF_FFMPEG", "ffmpeg")
UF = r"C:\Users\NMG\AppData\Local\Microsoft\Windows\Fonts"
F_BLACK = os.path.join(UF, "Pretendard-Black.otf")
F_XB = os.path.join(UF, "Pretendard-ExtraBold.otf")
F_BOLD = os.path.join(UF, "Pretendard-Bold.otf")
F_MED = os.path.join(UF, "Pretendard-Medium.otf")
F_NUM = os.path.join(UF, "GmarketSansTTFBold.ttf")

# ---- editable campaign copy -------------------------------------------------
DISCOUNT_LINE = "역대급 혜택 · 최대 할인"   # TODO: 확정 할인율로 교체
WEEK_DAYS = "단 7일"
TIMER_START = (6, 23, 59, 58)
# 워커/외부 실행 시 카피 덮어쓰기: SF_JOB=job.json  {"discount_line": "...", "week_days": "..."}
if os.environ.get("SF_JOB") and os.path.exists(os.environ["SF_JOB"]):
    _job = json.load(open(os.environ["SF_JOB"], encoding="utf-8"))
    DISCOUNT_LINE = _job.get("discount_line") or DISCOUNT_LINE
    WEEK_DAYS = _job.get("week_days") or WEEK_DAYS

REVIEWS = [
    ("1시간을 걸어도 발바닥, 발목 통증이\n전혀 없었어요.", "91523*****님"),
    ("76세 어머니와 삿포로 여행, 하루 만 보\n넘게 걸었는데 발이 안 피곤하셨대요.", "49960*****님"),
    ("스위스 여행 내내 르무통. 양말을 신든\n맨발이든 정말 편한 신발이었어요.", "45528*****님"),
    ("다리가 쉽게 아파 오래 걷기가 부담이었는데\n걷는 시간이 자연스럽게 늘었어요.", "48664*****님"),
    ("부모님과 설악산. 신어보신 신발 중\n가장 편하다고 하시는 아버지.", "39770*****님"),
]

CREAM = (246, 242, 235); BROWN = (58, 40, 30); TAN = (200, 176, 148)
RED = (196, 58, 40); WHITE = (255, 255, 255); DARK = (22, 18, 16); GOLD = (242, 184, 52)
INK = (40, 32, 28); MUTED = (120, 104, 92); TAN_D = (150, 132, 115)
SOFT = (235, 226, 214)

_fc = {}
def font(p, s):
    k = (p, s)
    if k not in _fc: _fc[k] = ImageFont.truetype(p, s)
    return _fc[k]

def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease_out(t): t = clamp(t); return 1 - (1 - t) ** 3
def ease_in_out(t): t = clamp(t); return t * t * (3 - 2 * t)
def ease_back(t):
    t = clamp(t); c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
def lerp(a, b, t): return a + (b - a) * t

# ---------------------------------------------------------------- video clips
def ensure_frames(name):
    d = os.path.join(FRAMES, name)
    if os.path.isdir(d) and glob.glob(os.path.join(d, "*.jpg")):
        return
    os.makedirs(d, exist_ok=True)
    src = os.path.join(CLIPS, name + ".mp4")
    if not os.path.exists(src):
        raise SystemExit(f"missing clip: {src}")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", src,
                    "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}",
                    "-q:v", "3", os.path.join(d, "%04d.jpg")], check=True)

_nframes = {}
_fcache = {}
def clip_frame(name, t, speed=1.0):
    """Full-bleed RGB frame of clip `name` at clip-time t (clamped to the clip)."""
    if name not in _nframes:
        ensure_frames(name)
        _nframes[name] = len(glob.glob(os.path.join(FRAMES, name, "*.jpg")))
    n = _nframes[name]
    idx = int(clamp(t * speed * FPS, 0, n - 1)) + 1
    k = (name, idx)
    if k not in _fcache:
        if len(_fcache) > 24: _fcache.clear()
        _fcache[k] = Image.open(os.path.join(FRAMES, name, f"{idx:04d}.jpg")).convert("RGB")
    return _fcache[k]

def paste_video(c, name, t, dark=1.0, zoom=1.0, speed=1.0):
    im = clip_frame(name, t, speed)
    if zoom != 1.0:
        zw, zh = int(W * zoom), int(H * zoom)
        im = im.resize((zw, zh), Image.BILINEAR).crop(((zw - W) // 2, (zh - H) // 2, (zw - W) // 2 + W, (zh - H) // 2 + H))
    if dark != 1.0:
        im = ImageEnhance.Brightness(im).enhance(dark)
    c.paste(im, (0, 0))

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
        ImageDraw.Draw(s).rounded_rectangle((pad, pad + 18, pad + w, pad + h + 18), radius=44, fill=(0, 0, 0, 120))
        _shadow[k] = s.filter(ImageFilter.GaussianBlur(24))
    return _shadow[k]

def draw_video_card(c, name, t, cy=1500, w=680, h=680, zoom=1.0, speed=1.0):
    """Video inside a rounded card (used on the typographic WEEK scene)."""
    im = clip_frame(name, t, speed)
    s = max(w / W, h / H) * zoom
    big = im.resize((int(W * s), int(H * s)), Image.BILINEAR)
    x0, y0 = (big.width - w) // 2, (big.height - h) // 2
    crop = big.crop((x0, y0, x0 + w, y0 + h))
    layer = Image.new("RGBA", (w, h)); layer.paste(crop, (0, 0)); layer.putalpha(rounded_mask(w, h))
    sh = shadow(w, h)
    c.alpha_composite(sh, (int(W / 2 - sh.width / 2), int(cy - sh.height / 2)))
    c.alpha_composite(layer, (int(W / 2 - w / 2), int(cy - h / 2)))

# ---------------------------------------------------------------- overlays
_grad = {}
def gradient(c, top=True, h=700, alpha=170, color=(20, 14, 12)):
    k = (top, h, alpha, color)
    if k not in _grad:
        a = (np.linspace(1, 0, h) ** 1.6 * alpha).astype(np.uint8)
        if not top: a = a[::-1]
        layer = Image.new("RGBA", (W, H), color + (0,))
        m = Image.fromarray(np.repeat(a[:, None], W, axis=1), "L")
        full = Image.new("L", (W, H), 0); full.paste(m, (0, 0 if top else H - h))
        layer.putalpha(full); _grad[k] = layer
    c.alpha_composite(_grad[k])

def fade_text(d, xy, s, f, fill, prog, rise=20, anchor="mm"):
    if prog <= 0: return
    e = ease_out(prog)
    x, y = xy
    d.text((x, y + (1 - e) * rise), s, font=f, fill=fill + (int(255 * e),), anchor=anchor)

def kicker(d, y, s, prog=1.0, fill=SOFT):
    fade_text(d, (W / 2, y), s, font(F_MED, 26), fill, prog, rise=10)

def subline(d, y, s, prog=1.0, fill=SOFT, size=38):
    fade_text(d, (W / 2, y), s, font(F_MED, size), fill, prog, rise=16)

def headline(d, y, s, size=96, prog=1.0, fill=WHITE, font_path=F_XB):
    if prog <= 0: return
    f = font(font_path, size)
    lines = s.split("\n"); lh = size * 1.18
    y0 = y - lh * (len(lines) - 1) / 2
    for i, ln in enumerate(lines):
        lp = clamp((prog - i * 0.12) / 0.5)
        if lp <= 0: continue
        e = ease_out(lp)
        d.text((W / 2, y0 + i * lh + (1 - e) * 40), ln, font=f, fill=fill + (int(255 * e),), anchor="mm")

def tag(d, xy, s, prog=1.0, size=34, fg=WHITE, line=SOFT, fill=None, pad=(28, 14)):
    if prog <= 0: return
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

def rule(d, y, prog=1.0, half=90, fill=TAN_D):
    if prog <= 0: return
    w = half * ease_out(prog)
    d.line((W / 2 - w, y, W / 2 + w, y), fill=fill, width=2)

def pill(d, xy, s, size=44, bg=RED, fg=WHITE, prog=1.0, font_path=F_XB, pad=(30, 16)):
    if prog <= 0: return
    f = font(font_path, size)
    bb = d.textbbox((0, 0), s, font=f, anchor="lt")
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    bw, bh = tw + pad[0] * 2, th + pad[1] * 2
    sc = ease_back(prog); bw2, bh2 = bw * sc, bh * sc
    x, y = xy; x0, y0 = x - bw2 / 2, y - bh2 / 2
    d.rounded_rectangle((x0, y0, x0 + bw2, y0 + bh2), radius=bh2 / 2, fill=bg)
    if prog > 0.3:
        d.text((x0 + bw2 / 2, y0 + bh2 / 2), s, font=font(font_path, max(8, int(size * min(1, sc)))), fill=fg, anchor="mm")

def cloud(layer, cx, cy, s, alpha=1.0):
    if s <= 0 or alpha <= 0: return
    d = ImageDraw.Draw(layer); a = int(255 * clamp(alpha))
    puffs = [(0, 0, 1.0), (-0.75, 0.15, 0.72), (0.75, 0.15, 0.72), (-0.35, -0.45, 0.62), (0.4, -0.5, 0.66), (0, 0.35, 0.9)]
    for ox, oy, r in puffs:
        rr = r * s
        d.ellipse((cx + ox * s - rr, cy + oy * s - rr + 6, cx + ox * s + rr, cy + oy * s + rr + 6), fill=(190, 170, 150, int(a * 0.35)))
    for ox, oy, r in puffs:
        rr = r * s
        d.ellipse((cx + ox * s - rr, cy + oy * s - rr, cx + ox * s + rr, cy + oy * s + rr), fill=(255, 255, 255, a))

def cloud_pop(layer, t0, t, cx, cy, size=70, life=0.9):
    lt = t - t0
    if lt < 0 or lt > life: return
    s = size * ease_back(clamp(lt / 0.3))
    a = 1.0 if lt < life * 0.6 else 1 - (lt - life * 0.6) / (life * 0.4)
    cloud(layer, cx, cy - lt * 60, s, a)

def star(d, cx, cy, r, fill=GOLD):
    pts = []
    for i in range(10):
        ang = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + math.cos(ang) * rr, cy + math.sin(ang) * rr))
    d.polygon(pts, fill=fill)

def chevron(d, cx, cy, w, h, fill=RED, width=14):
    d.line([(cx - w / 2, cy - h / 2), (cx, cy + h / 2), (cx + w / 2, cy - h / 2)], fill=fill, width=width, joint="curve")

def notif_card(canvas, y_center, review, who, prog, alpha=1.0):
    if prog <= 0: return
    cw, ch = 940, 250
    layer = Image.new("RGBA", (cw + 40, ch + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((20, 24, 20 + cw, 24 + ch), radius=36, fill=(0, 0, 0, 70))
    d.rounded_rectangle((20, 20, 20 + cw, 20 + ch), radius=36, fill=(255, 255, 255, int(242 * alpha)))
    d.rounded_rectangle((52, 50, 52 + 64, 50 + 64), radius=16, fill=BROWN)
    d.text((52 + 32, 50 + 32), "L", font=font(F_BLACK, 40), fill=CREAM, anchor="mm")
    d.text((136, 62), "르무통 공식몰 · 리뷰", font=font(F_BOLD, 30), fill=(120, 110, 100), anchor="lm")
    d.text((20 + cw - 34, 62), "방금", font=font(F_MED, 28), fill=(150, 140, 130), anchor="rm")
    for i in range(5): star(d, 136 + 20 + i * 42, 106, 17)
    d.multiline_text((136, 132), review, font=font(F_BOLD, 34), fill=INK, spacing=8)
    d.text((20 + cw - 34, 20 + ch - 30), who, font=font(F_MED, 26), fill=(150, 140, 130), anchor="rm")
    e = ease_back(prog); sc = lerp(0.85, 1.0, e)
    if sc != 1.0: layer = layer.resize((int(layer.width * sc), int(layer.height * sc)), Image.BILINEAR)
    y = int(y_center - layer.height / 2 + (1 - e) * 120); x = int(W / 2 - layer.width / 2)
    if alpha < 1:
        a = layer.split()[3].point(lambda v: int(v * alpha)); layer.putalpha(a)
    canvas.alpha_composite(layer, (x, y))

# ---------------------------------------------------------------- timeline
D = json.load(open(os.path.join(HERE, "tts", "durations.json")))
T_N0 = 0.35
T_SNAP = 3.75
T_N1 = 7.3
T_N2 = T_N1 + D["n1"] + 0.35
T_N3 = T_N2 + D["n2"] + 0.35
T_N4 = T_N3 + D["n3"] + 0.3
T_END = T_N4 + D["n4"] + 1.2
TOTAL = T_END
N = int(TOTAL * FPS)

SCENES = []
def scene(start, end):
    def deco(fn): SCENES.append((start, end, fn)); return fn
    return deco

@scene(0.0, T_SNAP)
def s_hook(t, dur, c, d):
    paste_video(c, "hook_feet", t, dark=0.55, zoom=1.0 + 0.03 * t / dur)
    gradient(c, top=False, h=1100, alpha=210)
    gradient(c, top=True, h=500, alpha=150)
    beat = max(0.0, math.sin((t % 0.9) / 0.9 * math.pi * 2)) ** 8
    kicker(d, 210, "L E   M O U T O N", prog=t / 0.5, fill=TAN)
    f = font(F_XB, int(94 * (1 + 0.012 * beat)))
    for i, (ln, t0) in enumerate([("오늘도 발바닥이", 0.25), ("터질 것 같나요?", 0.6)]):
        fade_text(d, (W / 2, 1180 + i * 124), ln, f, CREAM, (t - t0) / 0.6, rise=26)
    rule(d, 1400, prog=(t - 1.2) / 0.5)
    subline(d, 1470, "구두 9시간  ·  지하철 환승 두 번  ·  서서 회의", prog=(t - 1.5) / 0.5, fill=(190, 172, 155), size=34)
    subline(d, 1720, "그 발, 잠깐 쉬게 해줄게요", prog=(t - 2.5) / 0.4, fill=(160, 142, 125), size=32)

@scene(T_SNAP, T_N1)
def s_bright(t, dur, c, d):
    paste_video(c, "cloud_walk", t, zoom=1.0 + 0.05 * ease_in_out(t / dur))
    gradient(c, top=True, h=640, alpha=150)
    gradient(c, top=False, h=520, alpha=140)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for k in range(4):
        cloud_pop(layer, 0.3 + k * 0.8, t, W / 2 + (-260 + k * 175), 1640, size=44 + (k % 2) * 8, life=0.9)
    c.alpha_composite(layer)
    kicker(d, 190, "L E   M O U T O N", prog=(t - 0.05) / 0.4)
    headline(d, 300, "구름 위를 걷는 기분", size=84, prog=t / 0.5)
    if t < 1.75: subline(d, 1770, "가볍게, 하루 종일", prog=(t - 0.35) / 0.4)
    else: subline(d, 1770, "벗고 싶지 않은 편안함", prog=(t - 1.75) / 0.4)

T_C1 = 3.6
@scene(T_N1, T_N2)
def s_secret(t, dur, c, d):
    if t < T_C1:
        paste_video(c, "squeeze_wool", t, zoom=1.0 + 0.04 * ease_out(t / T_C1))
        gradient(c, top=True, h=640, alpha=150); gradient(c, top=False, h=560, alpha=150)
        kicker(d, 190, "THE SECRET", prog=t / 0.4)
        headline(d, 300, "인생 신발의 비밀", size=84, prog=t / 0.5)
        tag(d, (W / 2, 1560), "솜사탕처럼 말랑", prog=(t - 0.7) / 0.4)
        if t < 2.0: subline(d, 1720, "손으로 비틀어도 이 정도로 부드럽게", prog=(t - 1.1) / 0.4)
        else:
            tag(d, (W / 2, 1640), "프리미엄 메리노 울 · 특허 원단 H1-TEX", prog=(t - 2.0) / 0.4, size=30)
            subline(d, 1760, "발을 포근하게 감싸는 소재", prog=(t - 2.3) / 0.4)
    else:
        lt = t - T_C1
        paste_video(c, "barefoot_cross", lt, zoom=1.0 + 0.05 * ease_in_out(lt / (dur - T_C1)))
        gradient(c, top=True, h=640, alpha=150); gradient(c, top=False, h=520, alpha=140)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for t0, x, y, sz in [(0.15, 440, 1500, 62), (0.6, 670, 1540, 54), (1.05, 480, 1580, 68), (1.5, 690, 1480, 58), (1.95, 545, 1530, 64)]:
            cloud_pop(layer, t0, lt, x, y, size=sz, life=1.0)
        c.alpha_composite(layer)
        kicker(d, 170, "BAREFOOT FRIENDLY", prog=lt / 0.4)
        headline(d, 300, "맨발로 신어도\n뒤꿈치 안 까짐", size=78, prog=lt / 0.5)
        subline(d, 1770, "깃털처럼 가벼운 무게", prog=(lt - 0.9) / 0.4)

@scene(T_N2, T_N3)
def s_reviews(t, dur, c, d):
    half = dur / 2
    if t < half: paste_video(c, "travel_walk", t, dark=0.85, zoom=1.0 + 0.05 * (t / half))
    else: paste_video(c, "parents_hike", t - half, dark=0.85, zoom=1.0 + 0.05 * ((t - half) / half))
    gradient(c, top=True, h=760, alpha=200); gradient(c, top=False, h=900, alpha=160)
    kicker(d, 170, "REAL REVIEWS", prog=t / 0.4, fill=(220, 205, 190))
    headline(d, 270, "리뷰가 증명하는 편안함", size=80, prog=t / 0.5)
    tag(d, (W / 2, 385), "실제 구매 후기", prog=(t - 0.3) / 0.4, line=(235, 225, 210))
    times = [0.4 + k * 1.3 for k in range(len(REVIEWS))]
    shown = [k for k, t0 in enumerate(times) if t >= t0]
    base_y = 1640; gap = 275
    for k in shown:
        age = len(shown) - 1 - k
        if age > 2: continue
        prog = (t - times[k]) / 0.45
        slot_y = base_y - age * gap
        if age > 0:
            push = clamp((t - times[shown[-1]]) / 0.35)
            slot_y = lerp(base_y - (age - 1) * gap, slot_y, ease_out(push))
        alpha = 1.0 if age < 2 else 1 - clamp((t - times[shown[-1]]) / 0.35) * 0.55
        notif_card(c, slot_y, REVIEWS[k][0], REVIEWS[k][1], prog, alpha)

@scene(T_N3, T_N4)
def s_week(t, dur, c, d):
    c.paste(Image.new("RGB", (W, H), CREAM), (0, 0))
    e = ease_out(t / 0.5)
    d.rectangle((0, 0, W, int(760 * e)), fill=BROWN)
    if t > 0.2:
        p = ease_back(clamp((t - 0.2) / 0.5))
        d.text((W / 2, 200), "LE MOUTON", font=font(F_NUM, int(60 * p) or 8), fill=TAN, anchor="mm")
        d.text((W / 2, 400), "WEEK", font=font(F_BLACK, int(300 * p) or 8), fill=CREAM, anchor="mm")
    pill(d, (W / 2, 610), WEEK_DAYS, size=56, prog=(t - 0.7) / 0.35)
    if t > 1.0:
        p = ease_out((t - 1.0) / 0.4)
        secs = TIMER_START[0] * 86400 + TIMER_START[1] * 3600 + TIMER_START[2] * 60 + TIMER_START[3] - int(t - 1.0)
        dd, r = divmod(secs, 86400); hh, r = divmod(r, 3600); mm, ss = divmod(r, 60)
        y = 900 - (1 - p) * 40
        d.text((W / 2, y - 90), "남은 시간", font=font(F_BOLD, 40), fill=(140, 120, 100), anchor="mm")
        d.text((W / 2, y), f"{dd:02d} : {hh:02d} : {mm:02d} : {ss:02d}", font=font(F_NUM, 120), fill=INK, anchor="mm")
        d.text((W / 2, y + 90), "일          시          분          초", font=font(F_MED, 32), fill=(160, 140, 120), anchor="mm")
    if t > 1.6:
        on = int((t - 1.6) * 3) % 2 == 0
        d.text((W / 2, 1090), DISCOUNT_LINE, font=font(F_BLACK, 84), fill=RED if on else (230, 120, 100), anchor="mm")
    if t > 2.0:
        p = ease_back(clamp((t - 2.0) / 0.5))
        draw_video_card(c, "product_hero", t, cy=1500, w=int(700 * p) or 2, h=int(620 * p) or 2)
    subline(d, 1860, "놓치면 1년 기다립니다", prog=(t - 2.6) / 0.4, fill=MUTED, size=36)

T_D1 = 5.0
@scene(T_N4, TOTAL)
def s_cta(t, dur, c, d):
    if t < T_D1: paste_video(c, "cta_hold", t, dark=0.9, zoom=1.0 + 0.04 * (t / T_D1))
    else: paste_video(c, "product_hero", 2.0 + (t - T_D1), dark=0.9, zoom=1.0 + 0.04 * ((t - T_D1) / (dur - T_D1)))
    gradient(c, top=True, h=820, alpha=200); gradient(c, top=False, h=700, alpha=170)
    pulse = 1 + 0.05 * math.sin(t * 8)
    pill(d, (W / 2, 160), "인기 사이즈 소진 중", size=int(50 * pulse), prog=t / 0.35)
    if t < 3.2: headline(d, 330, "지금 안 사면\n다음엔 내 사이즈 없음", size=76, prog=(t - 0.3) / 0.5)
    elif t < 6.2: headline(d, 330, "지친 발에게\n완벽한 휴식을", size=84, prog=(t - 3.2) / 0.5)
    else:
        headline(d, 320, "르무통 위크", size=92, prog=(t - 6.2) / 0.5)
        tag(d, (W / 2, 445), "르무통 공식 브랜드스토어", prog=(t - 6.5) / 0.4, line=(235, 225, 210))
    if t > 0.8:
        p = ease_back(clamp((t - 0.8) / 0.45))
        by = 1560 + (1 - p) * 200
        d.rounded_rectangle((70, by, W - 70, by + 240), radius=40, fill=WHITE)
        d.text((W / 2, by + 78), "하단 링크에서 구매하기", font=font(F_BLACK, 62), fill=INK, anchor="mm")
        d.text((W / 2, by + 150), "르무통 위크 혜택가로 만나보세요", font=font(F_MED, 34), fill=(130, 115, 100), anchor="mm")
        bounce = abs(math.sin(t * 6)) * 22
        for k in range(3):
            a = 1 - k * 0.3
            col = tuple(int(lerp(255, RED[i], a)) for i in range(3))
            chevron(d, W / 2, by + 205 + bounce + k * 18 - 40, 90, 34, fill=col, width=12)

# ---------------------------------------------------------------- audio (v1 synth, unchanged)
SR = 44100
def load_wav(p):
    with wave.open(p) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
        if w.getnchannels() == 2: a = a.reshape(-1, 2).mean(1)
    return a

def synth():
    n = int(TOTAL * SR) + SR
    mix = np.zeros(n); music = np.zeros(n); voice = np.zeros(n)
    def add(dst, sig, at, gain=1.0):
        i = int(at * SR); j = min(n, i + len(sig))
        if i < n: dst[i:j] += sig[: j - i] * gain
    def tone(freq, length, decay=0.3, harm=(1,)):
        t = np.arange(int(length * SR)) / SR
        s = sum(np.sin(2 * np.pi * freq * h * t) / (k + 1) for k, h in enumerate(harm))
        return s * np.exp(-t / decay)
    def noise(length, lp=1, decay=0.05):
        s = np.random.randn(int(length * SR))
        if lp > 1: s = np.convolve(s, np.ones(lp) / lp, mode="same")
        return s / (np.max(np.abs(s)) + 1e-9) * np.exp(-np.arange(len(s)) / SR / decay)
    def kick(soft=False):
        t = np.arange(int(0.3 * SR)) / SR
        f = (120 if soft else 150) * np.exp(-t * 20) + 48
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (12 if soft else 9))
    def heartbeat():
        t = np.arange(int(0.5 * SR)) / SR
        f = 70 * np.exp(-t * 12) + 35
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 10)
        s2 = np.zeros_like(s); k = int(0.16 * SR); s2[k:] = s[:-k] * 0.7
        return s + s2
    def snap():
        s = np.random.randn(int(0.09 * SR))
        s = np.diff(s, prepend=0); s = np.diff(s, prepend=0)
        s = s / np.max(np.abs(s)) * np.exp(-np.arange(len(s)) / SR / 0.012)
        tn = tone(2400, 0.05, 0.01) * 0.4
        s[: len(tn)] += tn
        return s
    def whoosh(length=0.3):
        s = noise(length, lp=30, decay=10)
        t = np.arange(len(s)) / SR
        return s * np.sin(np.pi * t / length) ** 2
    def poof(): return noise(0.18, lp=90, decay=0.06) * 0.8
    def notif():
        return tone(1318, 0.25, 0.08) * 0.6 + np.concatenate([np.zeros(int(0.09 * SR)), tone(1760, 0.3, 0.12)])[: int(0.25 * SR)] * 0.6
    def tick(): return tone(3000, 0.03, 0.006)
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

    for at in np.arange(0.2, T_SNAP - 0.3, 0.9): add(mix, heartbeat(), at, 0.8)
    t = np.arange(int(T_SNAP * SR)) / SR
    add(mix, np.sin(2 * np.pi * 55 * t) * 0.25 * np.minimum(t / 1.0, 1) * np.minimum((T_SNAP - t) / 0.3, 1), 0)
    add(mix, riser(0.9), T_SNAP - 0.9, 0.5)
    add(mix, snap(), T_SNAP, 1.0)
    add(mix, tone(1568, 1.2, 0.5, harm=(1, 2)), T_SNAP + 0.02, 0.25)

    bpm = 112; beat = 60 / bpm; bar = beat * 4
    chords = [(261.6, 329.6, 392.0), (220.0, 261.6, 329.6), (174.6, 220.0, 261.6), (196.0, 246.9, 293.7)]
    b = T_SNAP; k = 0
    while b < TOTAL - 0.3:
        ch = chords[(k // 4) % 4]
        if k % 4 == 0: add(music, pad([f / 2 for f in ch], bar + 0.2), b, 0.22)
        add(music, kick(soft=True), b, 0.5 if k % 2 == 0 else 0.35)
        add(music, noise(0.05, lp=1, decay=0.015), b + beat / 2, 0.10)
        if k % 2 == 1: add(music, noise(0.12, lp=6, decay=0.04), b, 0.16)
        for j in range(2):
            f = ch[(k * 2 + j) % 3] * (2 if j == 1 else 1)
            add(music, pluck(f, beat), b + j * beat / 2, 0.16)
        b += beat; k += 1

    for key, at in [("n0", T_N0), ("n1", T_N1), ("n2", T_N2), ("n3", T_N3), ("n4", T_N4)]:
        add(voice, load_wav(os.path.join(HERE, "tts", key + ".wav")), at, 1.0)
    env = np.convolve(np.abs(voice), np.ones(int(0.08 * SR)) / int(0.08 * SR), mode="same")
    music *= 1 - 0.6 * np.clip(env / 0.05, 0, 1)

    add(mix, whoosh(0.25), T_SNAP - 0.05, 0.35)
    for k in range(4):
        for kk in range(2): add(mix, poof(), T_SNAP + 0.3 + k * 0.8 + kk * 0.22, 0.4)
    add(mix, whoosh(0.25), T_N1 + T_C1 - 0.05, 0.35)
    for t0 in [0.15, 0.6, 1.05, 1.5, 1.95]: add(mix, poof(), T_N1 + T_C1 + t0, 0.5)
    for kk in range(len(REVIEWS)): add(mix, notif(), T_N2 + 0.4 + kk * 1.3, 0.55)
    add(mix, whoosh(0.2), T_N2 + (T_N3 - T_N2) / 2 - 0.05, 0.25)
    add(mix, whoosh(0.4), T_N3 - 0.1, 0.5); add(mix, kick(), T_N3 + 0.2, 0.9)
    for at in np.arange(T_N3 + 1.0, T_N4, 1.0): add(mix, tick(), at, 0.35)
    add(mix, whoosh(0.3), T_N4 - 0.05, 0.4)
    for at in [T_N4 + 3.2, T_N4 + T_D1, T_N4 + 6.2]: add(mix, whoosh(0.25), at - 0.05, 0.3)
    add(mix, riser(1.0), TOTAL - 1.6, 0.35); add(mix, tone(1046, 1.5, 0.6, harm=(1, 2, 3)), TOTAL - 0.6, 0.3)

    total = mix + music * 0.9 + voice * 1.15
    total = np.tanh(total * 1.1) * 0.95
    fo = int(0.6 * SR); total[-fo:] *= np.linspace(1, 0, fo)
    path = os.path.join(WORK, "audio.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((total * 32767).astype(np.int16).tobytes())
    return path

# ---------------------------------------------------------------- render
def frame(i):
    t = i / FPS
    c = Image.new("RGBA", (W, H), CREAM + (255,))
    d = ImageDraw.Draw(c, "RGBA")
    for s, e, fn in SCENES:
        if s <= t < e:
            fn(t - s, e - s, c, d); break
    WIPE = 0.32
    if 0 <= t - T_SNAP < WIPE:
        old = Image.new("RGBA", (W, H), CREAM + (255,))
        s_hook(T_SNAP - 0.001, T_SNAP, old, ImageDraw.Draw(old, "RGBA"))
        r = ease_out((t - T_SNAP) / WIPE) * 1250
        m = Image.new("L", (W, H), 0)
        ImageDraw.Draw(m).ellipse((W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r), fill=255)
        ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(ring).ellipse((W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r), outline=CREAM + (255,), width=18)
        c = Image.composite(c, old, m); c.alpha_composite(ring)
    return c.convert("RGB")

STILLS = [0.9, 2.2, 3.4, 4.6, 6.4, 8.4, 10.6, 12.6, 15.0, 19.6, 23.4, 28.4, 32.0, 35.8]
def save_stills():
    cols = 7; tw, th = 270, 480
    sheet = Image.new("RGB", (cols * tw, 2 * th), "black")
    for i, ts in enumerate(STILLS):
        sheet.paste(frame(int(ts * FPS)).resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
    sheet.save(os.path.join(WORK, "stills_sheet.jpg"), quality=85)

def main():
    for name in ["hook_feet", "cloud_walk", "squeeze_wool", "barefoot_cross", "travel_walk", "parents_hike", "product_hero", "cta_hold"]:
        ensure_frames(name)
    if "--stills" in sys.argv:
        save_stills(); print("stills ok"); return
    audio = synth(); print("audio ok", round(TOTAL, 2), "s")
    cmd = [FFMPEG, "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", audio, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(N):
        p.stdin.write(frame(i).tobytes())
        if i % 150 == 0: print(f"frame {i}/{N}", flush=True)
    p.stdin.close(); p.wait(); print("done", OUT, p.returncode)
    save_stills()

if __name__ == "__main__":
    main()
