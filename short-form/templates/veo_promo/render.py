# -*- coding: utf-8 -*-
"""veo_promo — 샷별 클립(업로드 또는 Veo API 생성, 1080x1920 30fps 정규화됨) + AI 스크립트 → 타이포·내레이션 합성.
입력 SF_JOB(job.json): script.scenes[] (id 가 clips 키), clips {id: 로컬 mp4}. 프레임은 SF_FRAMES/<id>/NNNN.jpg 로 추출.
"""
import os, sys, glob, math, subprocess
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sf_common import *  # noqa

job = load_job()
script = job["script"]
clips = job["clips"]
scenes = script["scenes"]
missing = [s["id"] for s in scenes if not clips.get(s["id"]) or not os.path.exists(clips[s["id"]])]
if missing:
    raise SystemExit("클립이 없는 샷: " + ", ".join(missing))

# ---------------------------------------------------------------- clip frames
def ensure_frames(sid):
    d = os.path.join(FRAMES, sid)
    if os.path.isdir(d) and glob.glob(os.path.join(d, "*.jpg")):
        return
    os.makedirs(d, exist_ok=True)
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", clips[sid],
                    "-vf", f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS}",
                    "-q:v", "3", os.path.join(d, "%04d.jpg")], check=True)

_n = {}; _fc2 = {}
def clip_frame(sid, t, speed=1.0):
    if sid not in _n:
        ensure_frames(sid); _n[sid] = len(glob.glob(os.path.join(FRAMES, sid, "*.jpg")))
    n = _n[sid]
    idx = int(clamp(t * speed * FPS, 0, n - 1)) + 1
    k = (sid, idx)
    if k not in _fc2:
        if len(_fc2) > 24: _fc2.clear()
        _fc2[k] = Image.open(os.path.join(FRAMES, sid, f"{idx:04d}.jpg")).convert("RGB")
    return _fc2[k]

def clip_len(sid):
    if sid not in _n:
        ensure_frames(sid); _n[sid] = len(glob.glob(os.path.join(FRAMES, sid, "*.jpg")))
    return _n[sid] / FPS

def paste_video(c, sid, t, dur, dark=1.0, zoom=1.0):
    # 장면이 클립보다 길면 느리게 재생해 끝까지 채운다
    L = clip_len(sid)
    speed = min(1.0, L / dur) if dur > 0 else 1.0
    im = clip_frame(sid, t, speed)
    if zoom != 1.0:
        zw, zh = int(W * zoom), int(H * zoom)
        im = im.resize((zw, zh), Image.BILINEAR).crop(((zw - W) // 2, (zh - H) // 2, (zw - W) // 2 + W, (zh - H) // 2 + H))
    if dark != 1.0: im = ImageEnhance.Brightness(im).enhance(dark)
    c.paste(im, (0, 0))

# ---------------------------------------------------------------- timeline
durs = tts(script)
timeline, TOTAL = build_timeline(script, durs, "clips")
print("timeline", [(s, round(a, 1), round(b, 1)) for s, a, b in timeline], "total", round(TOTAL, 1), flush=True)

def draw_scene(k, sc, t, dur, c, d):
    role = sc.get("role", "benefit")
    sid = sc["id"]
    if role == "hook":
        paste_video(c, sid, t, dur, dark=0.6, zoom=1.0 + 0.03 * t / dur)
        gradient(c, top=False, h=1150, alpha=210); gradient(c, top=True, h=500, alpha=150)
        brand_mark(d, script.get("brand", ""), y=210, prog=t / 0.5)
        beat = max(0.0, math.sin((t % 0.9) / 0.9 * math.pi * 2)) ** 8
        headline(d, 1180, sc["headline"], size=int(100 * (1 + 0.012 * beat)), prog=(t - 0.25) / 0.6, path=F_BLACK)
        rule(d, 1420, prog=(t - 1.2) / 0.5)
        subline(d, 1500, sc["sub"], prog=(t - 1.5) / 0.5, fill=(215, 205, 195), size=36)
        kicker(d, 1740, sc["kicker"], prog=(t - 2.4) / 0.4, fill=(180, 168, 155))
    elif role == "offer":
        paste_video(c, sid, t, dur, dark=0.75, zoom=1.0 + 0.04 * ease_in_out(t / dur))
        gradient(c, top=True, h=820, alpha=210); gradient(c, top=False, h=700, alpha=180)
        brand_mark(d, script.get("brand", ""), y=150, prog=t / 0.4, fill=(200, 190, 178))
        headline(d, 340, sc["headline"], size=100, prog=(t - 0.2) / 0.5, path=F_BLACK)
        pill(d, (W / 2, 540), sc["kicker"], size=52, prog=(t - 0.8) / 0.35)
        if t > 1.1:
            on = int((t - 1.1) * 3) % 2 == 0
            f, lines = fit_font(sc["sub"], F_BLACK, 70, 920, min_size=42, max_lines=2)
            for j, ln in enumerate(lines):
                d.text((W / 2 + 3, 1560 + j * f.size * 1.2 + 4), ln, font=f, fill=(0, 0, 0, 120), anchor="mm")
                d.text((W / 2, 1560 + j * f.size * 1.2), ln, font=f, fill=ACCENT2 if on else (255, 235, 180), anchor="mm")
    elif role == "proof":
        paste_video(c, sid, t, dur, dark=0.85, zoom=1.0 + 0.05 * (t / dur))
        gradient(c, top=True, h=760, alpha=200); gradient(c, top=False, h=900, alpha=160)
        kicker(d, 170, sc["kicker"], prog=t / 0.4, fill=(220, 205, 190))
        headline(d, 300, sc["headline"], size=84, prog=t / 0.5)
        tag(d, (W / 2, 440), sc["sub"][:24], prog=(t - 0.4) / 0.4, line=(235, 225, 210))
        if t > 0.8:
            e = ease_back(clamp((t - 0.8) / 0.5))
            cw, ch = 940, 230
            layer = Image.new("RGBA", (cw + 40, ch + 40), (0, 0, 0, 0))
            ld = ImageDraw.Draw(layer)
            ld.rounded_rectangle((20, 24, 20 + cw, 24 + ch), radius=36, fill=(0, 0, 0, 70))
            ld.rounded_rectangle((20, 20, 20 + cw, 20 + ch), radius=36, fill=(255, 255, 255, 240))
            ld.text((60, 62), script.get("brand", ""), font=font(F_BOLD, 28), fill=(120, 110, 100), anchor="lm")
            for s_ in range(5):
                cx, cy = 60 + 18 + s_ * 40, 108
                pts = [(cx + math.cos(-math.pi / 2 + j * math.pi / 5) * (16 if j % 2 == 0 else 7),
                        cy + math.sin(-math.pi / 2 + j * math.pi / 5) * (16 if j % 2 == 0 else 7)) for j in range(10)]
                ld.polygon(pts, fill=ACCENT2)
            f, lines = fit_font(sc.get("narration") or sc["sub"], F_BOLD, 34, 860, min_size=26, max_lines=2)
            for j, ln in enumerate(lines):
                ld.text((60, 150 + j * f.size * 1.25), ln, font=f, fill=INK, anchor="lm")
            sc_ = lerp(0.85, 1.0, e)
            if sc_ != 1.0: layer = layer.resize((int(layer.width * sc_), int(layer.height * sc_)), Image.BILINEAR)
            c.alpha_composite(layer, (int(W / 2 - layer.width / 2), int(1560 - layer.height / 2 + (1 - e) * 120)))
    else:  # benefit / cta(중간)
        top = k % 2 == 1
        paste_video(c, sid, t, dur, zoom=1.0 + 0.05 * ease_in_out(t / dur))
        gradient(c, top=True, h=680, alpha=170); gradient(c, top=False, h=640, alpha=170)
        if top:
            kicker(d, 190, sc["kicker"], prog=t / 0.4)
            headline(d, 320, sc["headline"], size=88, prog=(t - 0.1) / 0.5)
            subline(d, 1770, sc["sub"], prog=(t - 0.9) / 0.4)
        else:
            kicker(d, 1430, sc["kicker"], prog=t / 0.4)
            headline(d, 1560, sc["headline"], size=88, prog=(t - 0.1) / 0.5)
            subline(d, 1760, sc["sub"], prog=(t - 0.9) / 0.4)

def last_frame_img():
    sid = scenes[-1]["id"]
    return clip_frame(sid, clip_len(sid) - 0.1)

def frame(i):
    t = i / FPS
    c = Image.new("RGBA", (W, H), INK + (255,))
    d = ImageDraw.Draw(c, "RGBA")
    for k, (sid, s0, s1) in enumerate(timeline):
        if s0 <= t < s1 or (k == len(timeline) - 1 and t >= s0):
            if sid == "cta_end":
                end_card(c, d, t - s0, s1 - s0, script, bg_img=last_frame_img())
            else:
                draw_scene(k, scenes[k], t - s0, s1 - s0, c, d)
            X = 0.3
            if k > 0 and t - s0 < X:
                prev_id, p0, p1 = timeline[k - 1]
                old = Image.new("RGBA", (W, H), INK + (255,))
                od = ImageDraw.Draw(old, "RGBA")
                draw_scene(k - 1, scenes[k - 1], p1 - p0 - 0.001, p1 - p0, old, od)
                c = Image.blend(old, c, ease_out((t - s0) / X))
            break
    return c.convert("RGB")

def main():
    for sc in scenes: ensure_frames(sc["id"])
    audio = synth_audio(TOTAL, timeline, script)
    print("audio ok", round(TOTAL, 2), "s", flush=True)
    stills = [a + 1.5 for _, a, _ in timeline] + [TOTAL - 0.5]
    encode(frame, TOTAL, audio, stills_at=stills + [TOTAL * k / 14 for k in range(14 - len(stills))])

if __name__ == "__main__":
    main()
