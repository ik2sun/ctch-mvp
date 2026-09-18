# -*- coding: utf-8 -*-
"""Helinox x Sanzo Koumuten Chair One (re) promo short. 1080x1920 @30fps."""
import math, random, subprocess, sys, wave, struct, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

sys.stdout.reconfigure(encoding="utf-8")
random.seed(7)

W, H, FPS = 1080, 1920, 30
HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, "img")
OUT = os.path.join(HERE, "helinox_short.mp4")
FFMPEG = os.path.join(os.path.dirname(HERE), "tools", "ffbin", "ffmpeg.exe")

UF = r"C:\Users\NMG\AppData\Local\Microsoft\Windows\Fonts"
F_AGGRO = os.path.join(UF, "SB 어그로 B.ttf")
F_PRE_B = os.path.join(UF, "Pretendard-Bold.otf")
F_PRE_BL = os.path.join(UF, "Pretendard-Black.otf")
F_GM = os.path.join(UF, "GmarketSansTTFBold.ttf")

CREAM = (250, 246, 238)
WHITE = (255, 255, 255)
RED = (232, 57, 29)
YEL = (245, 179, 36)
BLK = (20, 18, 16)

_fc = {}
def font(path, size):
    k = (path, size)
    if k not in _fc:
        _fc[k] = ImageFont.truetype(path, size)
    return _fc[k]

_ic = {}
def img(name):
    if name not in _ic:
        _ic[name] = Image.open(os.path.join(IMG, name + ".jpg")).convert("RGB")
    return _ic[name]

# ---------------------------------------------------------------- easing
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def ease_out(t): t = clamp(t); return 1 - (1 - t) ** 3
def ease_in_out(t): t = clamp(t); return t * t * (3 - 2 * t)
def ease_back(t):
    t = clamp(t); c1, c3 = 1.70158, 2.70158
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
def lerp(a, b, t): return a + (b - a) * t

# ---------------------------------------------------------------- drawing helpers
def place_image(canvas, im, zoom=1.0, fx=0.5, fy=0.5, cy=None, angle=0.0, shake=0.0):
    """Draw square product image scaled so that zoom=1 -> width W. (fx,fy) = focus point."""
    cy = H / 2 if cy is None else cy
    S = int(W * zoom)
    r = im.resize((S, S), Image.LANCZOS if S < 1400 else Image.BILINEAR)
    if angle:
        r = r.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=WHITE)
    rw, rh = r.size
    dx = dy = 0
    if shake > 0:
        dx = random.uniform(-shake, shake); dy = random.uniform(-shake, shake)
    x = int(W / 2 - fx * S + (S - rw) / 2 + dx)
    y = int(cy - fy * S + (S - rh) / 2 + dy)
    canvas.paste(r, (x, y))

def text(d, xy, s, f, fill=BLK, stroke=0, stroke_fill=WHITE, anchor="mm"):
    d.text(xy, s, font=f, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=stroke_fill)

def caption(d, y, s, size=78, fill=WHITE, stroke_fill=BLK, prog=1.0, font_path=F_AGGRO):
    """Variety-show style bottom caption: white with heavy black stroke, pop-in."""
    if prog <= 0: return
    sc = ease_back(prog)
    f = font(font_path, max(8, int(size * sc)))
    text(d, (W / 2, y), s, f, fill=fill, stroke=int(10 * sc), stroke_fill=stroke_fill)

def label(d, y, s, size=64, bg=YEL, fg=BLK, prog=1.0, font_path=F_AGGRO, pad=(34, 18), tilt=0):
    """Rounded tag with text, slides in from left with overshoot."""
    if prog <= 0: return
    f = font(font_path, size)
    bb = d.textbbox((0, 0), s, font=f, anchor="lt")
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    bw, bh = tw + pad[0] * 2, th + pad[1] * 2
    ox = lerp(-bw - 40, W / 2 - bw / 2, ease_back(prog))
    box = Image.new("RGBA", (bw + 40, bh + 40), (0, 0, 0, 0))
    bd = ImageDraw.Draw(box)
    bd.rounded_rectangle((20, 20, 20 + bw, 20 + bh), radius=18, fill=bg)
    bd.text((20 + pad[0] - bb[0], 20 + pad[1] - bb[1]), s, font=f, fill=fg)
    if tilt: box = box.rotate(tilt, resample=Image.BICUBIC, expand=True)
    d._image.paste(box, (int(ox) - 20, int(y - box.height / 2)), box)

def highlight_text(d, y, s, size=110, prog=1.0, color=BLK, hl=YEL, font_path=F_AGGRO):
    """Big headline with a yellow marker bar growing behind it."""
    if prog <= 0: return
    f = font(font_path, size)
    bb = d.textbbox((W / 2, y), s, font=f, anchor="mm")
    tw = bb[2] - bb[0]
    g = ease_out(prog)
    x0 = bb[0] - 16; x1 = x0 + (tw + 32) * g
    d.rectangle((x0, bb[1] + size * 0.45, x1, bb[3] + 10), fill=hl)
    if prog > 0.35:
        a = clamp((prog - 0.35) / 0.4)
        text(d, (W / 2, y - (1 - a) * 20), s, f, fill=color)

def vignette_flash(canvas, amount):
    if amount <= 0: return canvas
    white = Image.new("RGB", (W, H), WHITE)
    return Image.blend(canvas, white, clamp(amount))

def corner_badge(d, s="LIMITED", prog=1.0):
    if prog <= 0: return
    f = font(F_GM, 34)
    sc = ease_back(prog)
    cx, cy = 945, 150
    r = int(95 * sc)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=RED)
    if prog > 0.5:
        text(d, (cx, cy - 14), s, font(F_GM, int(30 * sc)), fill=WHITE)
        text(d, (cx, cy + 22), "5TH ANNIV.", font(F_GM, int(22 * sc)), fill=YEL)

# ---------------------------------------------------------------- timeline
# Each scene: (start, end, fn(t_local, dur, canvas, draw))
SCENES = []
def scene(start, end):
    def deco(fn):
        SCENES.append((start, end, fn)); return fn
    return deco

TOP_Y = 330       # headline zone
CAP_Y = 1600      # caption zone
IMG_CY = 980

@scene(0.0, 1.7)
def s_hook(t, dur, c, d):
    # pouch, slow zoom in, suspicious caption
    place_image(c, img("p15"), zoom=lerp(1.02, 1.14, ease_in_out(t / dur)), cy=IMG_CY)
    highlight_text(d, TOP_Y, "이게 의자라고...?", size=112, prog=t / 0.5)
    caption(d, CAP_Y, "(파우치 아님 주의)", size=64, prog=(t - 0.7) / 0.3)

@scene(1.7, 3.3)
def s_weight(t, dur, c, d):
    # other side of pouch, tilt like a sticker, weight claim
    place_image(c, img("p16"), zoom=1.08, cy=IMG_CY, angle=lerp(-6, 4, ease_in_out(t / dur)))
    f = font(F_GM, 250)
    sc = ease_back(clamp(t / 0.4))
    text(d, (W / 2, TOP_Y + 10), "1.1kg", font(F_GM, max(8, int(250 * sc))), fill=RED)
    label(d, TOP_Y + 200, "노트북보다 가벼움", size=60, prog=(t - 0.4) / 0.35)
    caption(d, CAP_Y, "(저 정도로 가볍다고?)", size=64, prog=(t - 0.9) / 0.3)

@scene(3.3, 4.4)
def s_frame(t, dur, c, d):
    place_image(c, img("p13"), zoom=lerp(1.0, 1.1, ease_out(t / dur)), cy=IMG_CY)
    highlight_text(d, TOP_Y, "펼치면", size=120, prog=t / 0.35)
    caption(d, CAP_Y, "프레임이 알아서 착", size=70, prog=(t - 0.3) / 0.3)

@scene(4.4, 5.3)
def s_hub(t, dur, c, d):
    shake = 18 * (1 - clamp(t / 0.35))
    place_image(c, img("p12"), zoom=lerp(1.35, 1.2, ease_out(t / 0.5)), fx=0.5, fy=0.45, cy=IMG_CY, shake=shake)
    f = font(F_AGGRO, 260)
    sc = ease_back(clamp(t / 0.25))
    text(d, (W / 2, TOP_Y + 20), "착.", font(F_AGGRO, max(8, int(260 * sc))), fill=BLK, stroke=int(14 * sc), stroke_fill=YEL)
    caption(d, CAP_Y, "(찰칵 소리 남)", size=60, prog=(t - 0.35) / 0.25)

@scene(5.3, 8.2)
def s_reveal(t, dur, c, d):
    # payoff: full chair, punch in + shake, then settle
    z = lerp(1.55, 1.08, ease_out(t / 0.7))
    shake = 26 * (1 - clamp(t / 0.45))
    place_image(c, img("p01"), zoom=z, fx=0.5, fy=0.52, cy=IMG_CY + 20, shake=shake)
    f = font(F_AGGRO, 200)
    sc = ease_back(clamp(t / 0.3))
    if t < 1.4:
        a = 1.0 if t < 1.0 else 1 - (t - 1.0) / 0.4
        text(d, (W / 2, TOP_Y), "짜잔", font(F_AGGRO, max(8, int(200 * sc))), fill=RED, stroke=int(14 * sc), stroke_fill=WHITE)
    else:
        p = (t - 1.4) / 0.4
        text(d, (W / 2, TOP_Y - 60), "Sanzo Koumuten", font(F_GM, 62), fill=BLK)
        highlight_text(d, TOP_Y + 50, "X Helinox 체어원 (re)", size=86, prog=p)
    corner_badge(d, prog=(t - 1.9) / 0.4)
    if t < 1.5:
        caption(d, CAP_Y, "(뜯자마자 이 색감)", size=62, prog=(t - 0.6) / 0.3)
    else:
        caption(d, CAP_Y, "빈티지 레드 X 옐로우", size=76, prog=(t - 1.5) / 0.3)

@scene(8.2, 10.6)
def s_turn(t, dur, c, d):
    # turntable: rapid angle changes like a 360 spin
    seq = ["p02", "p03", "p05", "p04", "p02", "p01"]
    step = 0.4
    i = min(int(t / step), len(seq) - 1)
    lt = (t - i * step) / step
    place_image(c, img(seq[i]), zoom=lerp(1.12, 1.06, ease_out(lt)), cy=IMG_CY)
    highlight_text(d, TOP_Y, "360도 어디서 봐도", size=100, prog=t / 0.4)
    label(d, TOP_Y + 130, "산조 코무텐 5주년 한정", size=56, bg=RED, fg=WHITE, prog=(t - 0.4) / 0.35, tilt=-2)
    caption(d, CAP_Y, "(예쁨. 끝.)", size=72, prog=(t - 0.9) / 0.3)

@scene(10.6, 12.2)
def s_mesh(t, dur, c, d):
    place_image(c, img("p07"), zoom=lerp(1.25, 1.1, ease_out(t / dur)), fx=lerp(0.4, 0.55, ease_in_out(t / dur)), fy=0.45, cy=IMG_CY)
    highlight_text(d, TOP_Y, "여름엔 메쉬로", size=110, prog=t / 0.4)
    caption(d, CAP_Y, "숨통 트임", size=90, prog=(t - 0.35) / 0.3)

@scene(12.2, 13.6)
def s_pocket(t, dur, c, d):
    place_image(c, img("p09"), zoom=lerp(1.1, 1.22, ease_in_out(t / dur)), fx=0.35, fy=0.5, cy=IMG_CY)
    label(d, TOP_Y, "폰 주머니도 있음", size=74, bg=YEL, fg=BLK, prog=t / 0.35, tilt=2)
    caption(d, CAP_Y, "(사소한데 은근 중요)", size=62, prog=(t - 0.45) / 0.3)

@scene(13.6, 15.8)
def s_load(t, dur, c, d):
    shake = 14 * (1 - clamp((t - 0.75) / 0.3)) if t > 0.75 else 0
    place_image(c, img("p06"), zoom=lerp(1.2, 1.12, ease_out(t / dur)), fx=0.5, fy=0.42, cy=IMG_CY, shake=shake)
    n = int(145 * ease_out(t / 0.8))
    text(d, (W / 2, TOP_Y + 10), f"{n}kg", font(F_GM, 240), fill=RED)
    label(d, TOP_Y + 195, "까지 버팀", size=64, prog=(t - 0.8) / 0.3)
    caption(d, CAP_Y, "(치킨 먹고 앉아도 됨)", size=66, prog=(t - 1.15) / 0.3)

@scene(15.8, 18.3)
def s_cta(t, dur, c, d):
    # end card: red block top, pouch bottom
    d.rectangle((0, 0, W, 1040), fill=RED)
    place_image(c, img("p14"), zoom=lerp(0.95, 1.02, ease_out(t / dur)), cy=1480)
    p = ease_back(clamp(t / 0.45))
    text(d, (W / 2, 250 - (1 - p) * 40), "Sanzo Koumuten X Helinox", font(F_GM, 54), fill=YEL)
    text(d, (W / 2, 370), "Chair One (re)", font(F_GM, 96), fill=WHITE)
    if t > 0.4:
        q = ease_back(clamp((t - 0.4) / 0.4))
        text(d, (W / 2, 580), "265,000원", font(F_GM, max(8, int(150 * q))), fill=WHITE)
    label(d, 760, "한정 수량", size=60, bg=YEL, fg=BLK, prog=(t - 0.8) / 0.35)
    if t > 1.2:
        blink = 1 if int((t - 1.2) * 3) % 2 == 0 else 0.55
        col = tuple(int(255 * blink) for _ in range(3))
        text(d, (W / 2, 900), "다 팔리기 전에 ▶", font(F_AGGRO, 84), fill=col)
    text(d, (W / 2, 1860), "helinox.co.kr", font(F_PRE_B, 40), fill=BLK)

TOTAL = SCENES[-1][1]
N = int(TOTAL * FPS)

# ---------------------------------------------------------------- audio
SR = 44100
def synth():
    n = int(TOTAL * SR) + SR // 10
    mix = np.zeros(n, dtype=np.float64)
    tt = np.arange(n) / SR

    def add(sig, at, gain=1.0):
        i = int(at * SR)
        j = min(n, i + len(sig))
        if i < n: mix[i:j] += sig[: j - i] * gain

    def env(length, a=0.002, decay=0.15):
        t = np.arange(int(length * SR)) / SR
        return np.minimum(t / a, 1.0) * np.exp(-t / decay)

    def kick():
        t = np.arange(int(0.35 * SR)) / SR
        f = 150 * np.exp(-t * 18) + 45
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)

    def hat(length=0.06):
        s = np.random.randn(int(length * SR))
        s = np.diff(s, prepend=0)  # high-pass-ish
        return s / np.max(np.abs(s)) * np.exp(-np.arange(len(s)) / SR / 0.02)

    def whoosh(length=0.28):
        s = np.random.randn(int(length * SR))
        k = 40
        s = np.convolve(s, np.ones(k) / k, mode="same")  # low-pass
        t = np.arange(len(s)) / SR
        e = np.sin(np.pi * t / length) ** 2
        return s / np.max(np.abs(s)) * e

    def tick():
        t = np.arange(int(0.05 * SR)) / SR
        return np.sin(2 * np.pi * 2200 * t) * np.exp(-t * 120)

    def pop():
        t = np.arange(int(0.09 * SR)) / SR
        f = 900 - 500 * t / 0.09
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 40)

    def click():
        t = np.arange(int(0.08 * SR)) / SR
        s = np.random.randn(len(t)) * np.exp(-t * 90)
        return s / np.max(np.abs(s)) + np.sin(2 * np.pi * 1200 * t) * np.exp(-t * 60)

    def ding():
        t = np.arange(int(1.2 * SR)) / SR
        return (np.sin(2 * np.pi * 1046 * t) + 0.5 * np.sin(2 * np.pi * 2093 * t) + 0.25 * np.sin(2 * np.pi * 3136 * t)) * np.exp(-t * 3)

    def splat():
        t = np.arange(int(0.25 * SR)) / SR
        f = 400 * np.exp(-t * 10) + 60
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)

    # suspense ticks before the payoff
    for at in np.arange(0.0, 5.3, 0.5):
        add(tick(), at, 0.25)
    # bass pulse under intro
    for at in np.arange(0.0, 5.3, 1.0):
        add(kick(), at, 0.35)
    # payoff: beat kicks in at 5.3, 128 bpm
    bpm = 128; beat = 60 / bpm
    b = 5.3
    k = 0
    while b < TOTAL - 0.2:
        add(kick(), b, 0.55)
        add(hat(), b, 0.10)
        add(hat(), b + beat / 2, 0.18)
        if k % 2 == 1:
            add(splat(), b, 0.30)  # snare-ish thump on 2 and 4
        b += beat; k += 1
    add(ding(), 5.3, 0.55)
    add(whoosh(0.35), 5.05, 0.7)

    # cuts & caption pops
    cuts = [s for s, e, f in SCENES[1:]]
    for c_ in cuts:
        add(whoosh(0.22), c_ - 0.08, 0.45)
    # turntable clicks
    for i in range(6):
        add(click(), 8.2 + i * 0.4, 0.35)
    # caption pops (approx times)
    for at in [0.7, 1.7, 2.1, 2.6, 3.6, 4.4, 4.75, 5.9, 6.8, 7.2, 8.6, 9.1, 10.95, 12.2, 12.65, 14.4, 14.75, 16.2, 16.6, 17.0]:
        add(pop(), at, 0.3)
    # 145kg count-up rising tone
    t = np.arange(int(0.8 * SR)) / SR
    f = 300 + 500 * t / 0.8
    add(np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.5, 13.6, 0.25)
    add(ding(), 14.4, 0.4)

    mix = mix / max(1e-9, np.max(np.abs(mix))) * 0.85
    # fade out
    fo = int(0.5 * SR)
    mix[-fo:] *= np.linspace(1, 0, fo)
    pcm = (mix * 32767).astype(np.int16)
    path = os.path.join(HERE, "audio.wav")
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return path

# ---------------------------------------------------------------- render
def frame(i):
    t = i / FPS
    c = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(c)
    for s, e, fn in SCENES:
        if s <= t < e:
            fn(t - s, e - s, c, d)
            # white flash on the payoff cut
            if fn is s_reveal and t - s < 0.12:
                c = vignette_flash(c, 1 - (t - s) / 0.12)
            break
    return c

def main():
    audio = synth()
    print("audio ok")
    cmd = [FFMPEG, "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", audio,
           "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(N):
        p.stdin.write(frame(i).tobytes())
        if i % 60 == 0: print(f"frame {i}/{N}")
    p.stdin.close(); p.wait()
    print("done", OUT, p.returncode)
    # preview stills
    for tsec in [1.3, 3.0, 4.9, 6.2, 7.6, 9.8, 11.5, 13.2, 15.2, 17.5]:
        frame(int(tsec * FPS)).resize((270, 480)).save(os.path.join(HERE, f"still_{int(tsec*10):03d}.jpg"), quality=85)

if __name__ == "__main__":
    main()
