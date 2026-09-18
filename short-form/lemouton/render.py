# -*- coding: utf-8 -*-
"""Le Mouton Week promo short. 1080x1920 @30fps, narration + synthesized music/SFX."""
import math, random, subprocess, sys, wave, os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance

sys.stdout.reconfigure(encoding="utf-8")
random.seed(3)

W, H, FPS = 1080, 1920, 30
HERE = os.path.dirname(os.path.abspath(__file__))
AS = os.path.join(HERE, "assets")
OUT = os.path.join(HERE, "lemouton_week_short.mp4")
FFMPEG = os.path.join(os.path.dirname(HERE), "tools", "ffbin", "ffmpeg.exe")
UF = r"C:\Users\NMG\AppData\Local\Microsoft\Windows\Fonts"
F_BLACK = os.path.join(UF, "Pretendard-Black.otf")
F_XB = os.path.join(UF, "Pretendard-ExtraBold.otf")
F_BOLD = os.path.join(UF, "Pretendard-Bold.otf")
F_MED = os.path.join(UF, "Pretendard-Medium.otf")
F_NUM = os.path.join(UF, "GmarketSansTTFBold.ttf")

# ---- editable campaign copy -------------------------------------------------
DISCOUNT_LINE = "역대급 혜택 · 최대 할인"   # TODO: 확정 할인율로 교체 (예: "최대 40% 할인")
WEEK_DAYS = "단 7일"
TIMER_START = (6, 23, 59, 58)               # days, hours, minutes, seconds shown at the week card

REVIEWS = [  # 르무통 공식몰 게시 후기 (요약)
    ("1시간을 걸어도 발바닥, 발목 통증이\n전혀 없었어요.", "91523*****님"),
    ("76세 어머니와 삿포로 여행, 하루 만 보\n넘게 걸었는데 발이 안 피곤하셨대요.", "49960*****님"),
    ("스위스 여행 내내 르무통. 양말을 신든\n맨발이든 정말 편한 신발이었어요.", "45528*****님"),
    ("다리가 쉽게 아파 오래 걷기가 부담이었는데\n걷는 시간이 자연스럽게 늘었어요.", "48664*****님"),
    ("부모님과 설악산. 신어보신 신발 중\n가장 편하다고 하시는 아버지.", "39770*****님"),
]

CREAM = (246, 242, 235); BROWN = (58, 40, 30); TAN = (200, 176, 148)
RED = (196, 58, 40); WHITE = (255, 255, 255); DARK = (22, 18, 16); GOLD = (242, 184, 52)
INK = (40, 32, 28)

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

# ---------------------------------------------------------------- assets
_src = {}
def src(name):
    if name not in _src:
        _src[name] = Image.open(os.path.join(AS, name + ".jpg")).convert("RGB")
    return _src[name]

_bg = {}
def blurred_bg(name, dark=0.55, tint=None):
    k = (name, dark, tint)
    if k not in _bg:
        im = src(name)
        s = max(W / im.width, H / im.height) * 1.1
        big = im.resize((int(im.width * s), int(im.height * s)), Image.BILINEAR)
        x = (big.width - W) // 2; y = (big.height - H) // 2
        big = big.crop((x, y, x + W, y + H)).filter(ImageFilter.GaussianBlur(28))
        big = ImageEnhance.Brightness(big).enhance(dark)
        if tint:
            big = Image.blend(big, Image.new("RGB", (W, H), tint), 0.35)
        _bg[k] = big
    return _bg[k]

CARD_MAX_W, CARD_MAX_H, OVER = 980, 1340, 1.22
_card = {}
def card_src(name):
    """Pre-rendered oversized card source (for Ken Burns) + display size."""
    if name not in _card:
        im = src(name)
        s = min(CARD_MAX_W / im.width, CARD_MAX_H / im.height)
        cw, ch = int(im.width * s), int(im.height * s)
        big = im.resize((int(cw * OVER), int(ch * OVER)), Image.LANCZOS)
        _card[name] = (big, cw, ch)
    return _card[name]

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

def draw_card(canvas, name, zoom=1.0, fx=0.5, fy=0.5, cy=980, scale=1.0, angle=0.0, darken=1.0, sx=1.0):
    big, cw, ch = card_src(name)
    dw, dh = int(cw * scale * sx), int(ch * scale)
    # crop window in oversized source
    ww, wh = big.width / zoom / OVER * 1.0, big.height / zoom / OVER * 1.0
    ww, wh = min(big.width, ww * OVER / 1.0), min(big.height, wh * OVER / 1.0)
    cx0 = fx * big.width - ww / 2; cy0 = fy * big.height - wh / 2
    cx0 = clamp(cx0, 0, big.width - ww); cy0 = clamp(cy0, 0, big.height - wh)
    crop = big.crop((int(cx0), int(cy0), int(cx0 + ww), int(cy0 + wh))).resize((dw, dh), Image.BILINEAR)
    if darken != 1.0: crop = ImageEnhance.Brightness(crop).enhance(darken)
    m = rounded_mask(dw, dh)
    layer = Image.new("RGBA", (dw, dh)); layer.paste(crop, (0, 0)); layer.putalpha(m)
    sh = shadow(dw, dh)
    if angle:
        layer = layer.rotate(angle, resample=Image.BICUBIC, expand=True)
        sh = sh.rotate(angle, resample=Image.BICUBIC, expand=True)
    x = int(W / 2 - sh.width / 2); y = int(cy - sh.height / 2)
    canvas.alpha_composite(sh, (x, y))
    x = int(W / 2 - layer.width / 2); y = int(cy - layer.height / 2)
    canvas.alpha_composite(layer, (x, y))

def text(d, xy, s, f, fill=INK, anchor="mm", stroke=0, stroke_fill=WHITE, spacing=10, align="center"):
    d.multiline_text(xy, s, font=f, fill=fill, anchor=anchor if "\n" not in s else ("ma" if anchor[0] == "m" else anchor), spacing=spacing, align=align, stroke_width=stroke, stroke_fill=stroke_fill) if "\n" in s else d.text(xy, s, font=f, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=stroke_fill)

def headline(d, y, s, size=96, prog=1.0, fill=INK, font_path=F_BLACK, stroke=0, stroke_fill=WHITE):
    if prog <= 0: return
    p = ease_out(prog)
    f = font(font_path, size)
    lines = s.split("\n")
    lh = size * 1.18
    y0 = y - lh * (len(lines) - 1) / 2
    for i, ln in enumerate(lines):
        lp = clamp((prog - i * 0.12) / 0.5)
        if lp <= 0: continue
        e = ease_out(lp)
        d.text((W / 2, y0 + i * lh + (1 - e) * 40), ln, font=f, fill=fill + (int(255 * e),), anchor="mm", stroke_width=stroke, stroke_fill=stroke_fill)

def pill(d, xy, s, size=44, bg=RED, fg=WHITE, prog=1.0, font_path=F_XB, pad=(30, 16), anchor="mm"):
    if prog <= 0: return
    f = font(font_path, size)
    bb = d.textbbox((0, 0), s, font=f, anchor="lt")
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    bw, bh = tw + pad[0] * 2, th + pad[1] * 2
    sc = ease_back(prog)
    bw2, bh2 = bw * sc, bh * sc
    x, y = xy
    if anchor == "mm": x0, y0 = x - bw2 / 2, y - bh2 / 2
    elif anchor == "lm": x0, y0 = x, y - bh2 / 2
    else: x0, y0 = x - bw2, y - bh2 / 2
    d.rounded_rectangle((x0, y0, x0 + bw2, y0 + bh2), radius=bh2 / 2, fill=bg)
    if prog > 0.3:
        d.text((x0 + bw2 / 2, y0 + bh2 / 2), s, font=font(font_path, max(8, int(size * min(1, sc)))), fill=fg, anchor="mm")

def caption(d, y, s, size=64, prog=1.0, fill=WHITE, stroke_fill=INK):
    if prog <= 0: return
    sc = ease_back(prog)
    f = font(F_BLACK, max(8, int(size * sc)))
    text(d, (W / 2, y), s, f, fill=fill, stroke=int(9 * sc), stroke_fill=stroke_fill)

def cloud(layer, cx, cy, s, alpha=1.0):
    """Puffy cloud made of ellipses on an RGBA layer."""
    if s <= 0 or alpha <= 0: return
    d = ImageDraw.Draw(layer)
    a = int(255 * clamp(alpha))
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
    """iOS-like notification card with 5 stars."""
    if prog <= 0: return
    cw, ch = 940, 250
    layer = Image.new("RGBA", (cw + 40, ch + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((20, 24, 20 + cw, 24 + ch), radius=36, fill=(0, 0, 0, 70))
    d.rounded_rectangle((20, 20, 20 + cw, 20 + ch), radius=36, fill=(255, 255, 255, int(242 * alpha)))
    # app icon
    d.rounded_rectangle((52, 50, 52 + 64, 50 + 64), radius=16, fill=BROWN)
    d.text((52 + 32, 50 + 32), "L", font=font(F_BLACK, 40), fill=CREAM, anchor="mm")
    d.text((136, 62), "르무통 공식몰 · 리뷰", font=font(F_BOLD, 30), fill=(120, 110, 100), anchor="lm")
    d.text((20 + cw - 34, 62), "방금", font=font(F_MED, 28), fill=(150, 140, 130), anchor="rm")
    for i in range(5):
        star(d, 136 + 20 + i * 42, 106, 17)
    d.multiline_text((136, 132), review, font=font(F_BOLD, 34), fill=INK, spacing=8)
    d.text((20 + cw - 34, 20 + ch - 30), who, font=font(F_MED, 26), fill=(150, 140, 130), anchor="rm")
    e = ease_back(prog)
    sc = lerp(0.85, 1.0, e)
    if sc != 1.0:
        layer = layer.resize((int(layer.width * sc), int(layer.height * sc)), Image.BILINEAR)
    y = int(y_center - layer.height / 2 + (1 - e) * 120)
    x = int(W / 2 - layer.width / 2)
    if alpha < 1:
        a = layer.split()[3].point(lambda v: int(v * alpha)); layer.putalpha(a)
    canvas.alpha_composite(layer, (x, y))


# ---------------------------------------------------------------- refined helpers
MUTED = (120, 104, 92); TAN_D = (150, 132, 115)
_dark_bg = None
def dark_bg():
    global _dark_bg
    if _dark_bg is None:
        top, bot = np.array([19, 17, 16]), np.array([38, 31, 27])
        g = np.linspace(0, 1, H)[:, None, None]
        arr = (top + (bot - top) * g).astype(np.uint8)
        arr = np.repeat(arr, W, axis=1)
        rng = np.random.default_rng(1)
        arr = np.clip(arr.astype(np.int16) + rng.integers(-4, 5, (H, W, 1)), 0, 255).astype(np.uint8)
        _dark_bg = Image.fromarray(arr, "RGB")
    return _dark_bg

_cream_bg = None
def cream_bg():
    global _cream_bg
    if _cream_bg is None:
        top, bot = np.array([248, 245, 239]), np.array([238, 232, 222])
        g = np.linspace(0, 1, H)[:, None, None]
        arr = np.repeat((top + (bot - top) * g).astype(np.uint8), W, axis=1)
        _cream_bg = Image.fromarray(arr, "RGB")
    return _cream_bg

_grad = {}
def top_gradient(c, h=700, alpha=170, color=(20, 14, 12)):
    k = (h, alpha, color)
    if k not in _grad:
        a = (np.linspace(1, 0, h) ** 1.6 * alpha).astype(np.uint8)
        layer = Image.new("RGBA", (W, H), color + (0,))
        m = Image.fromarray(np.repeat(a[:, None], W, axis=1), "L")
        full = Image.new("L", (W, H), 0); full.paste(m, (0, 0))
        layer.putalpha(full); _grad[k] = layer
    c.alpha_composite(_grad[k])

def fade_text(d, xy, s, f, fill, prog, rise=20, anchor="mm"):
    if prog <= 0: return
    e = ease_out(prog)
    x, y = xy
    d.text((x, y + (1 - e) * rise), s, font=f, fill=fill + (int(255 * e),), anchor=anchor)

def kicker(d, y, s, prog=1.0, fill=TAN_D):
    fade_text(d, (W / 2, y), s, font(F_MED, 26), fill, prog, rise=10)

def subline(d, y, s, prog=1.0, fill=MUTED, size=38):
    fade_text(d, (W / 2, y), s, font(F_MED, size), fill, prog, rise=16)

def tag(d, xy, s, prog=1.0, size=34, fg=INK, line=TAN_D, fill=None, pad=(28, 14)):
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

# ---------------------------------------------------------------- timeline
D = json.load(open(os.path.join(HERE, "tts", "durations.json")))
T_N0 = 0.35
T_SNAP = 3.75
T_N1 = 7.3
T_N2 = T_N1 + D["n1"] + 0.35            # ~13.5
T_N3 = T_N2 + D["n2"] + 0.35            # ~20.9
T_N4 = T_N3 + D["n3"] + 0.3             # ~27.3
T_END = T_N4 + D["n4"] + 1.2            # ~37.1
TOTAL = T_END
N = int(TOTAL * FPS)

SCENES = []
def scene(start, end):
    def deco(fn): SCENES.append((start, end, fn)); return fn
    return deco

TOP_Y, CAP_Y = 300, 1690

@scene(0.0, T_SNAP)
def s_hook(t, dur, c, d):
    c.paste(dark_bg(), (0, 0))
    beat = max(0.0, math.sin((t % 0.9) / 0.9 * math.pi * 2)) ** 8
    kicker(d, 210, "L E   M O U T O N", prog=t / 0.5)
    sc = 1 + 0.012 * beat
    f = font(F_XB, int(94 * sc))
    for i, (ln, t0) in enumerate([("오늘도 발바닥이", 0.25), ("터질 것 같나요?", 0.6)]):
        fade_text(d, (W / 2, 830 + i * 124), ln, f, CREAM, (t - t0) / 0.6, rise=26)
    rule(d, 1050, prog=(t - 1.2) / 0.5)
    subline(d, 1120, "구두 9시간  ·  지하철 환승 두 번  ·  서서 회의", prog=(t - 1.5) / 0.5, fill=(165, 148, 132), size=34)
    subline(d, 1700, "그 발, 잠깐 쉬게 해줄게요", prog=(t - 2.5) / 0.4, fill=(125, 110, 96), size=32)

CUTS_B = [("yoona_walk", 0.0, 0.9), ("yoona_stairs", 0.9, 1.75), ("yoona_park", 1.75, 2.6), ("yoona_bench", 2.6, T_N1 - T_SNAP)]
@scene(T_SNAP, T_N1)
def s_bright(t, dur, c, d):
    c.paste(cream_bg(), (0, 0))
    for name, a, b in CUTS_B:
        if a <= t < b:
            lt = (t - a) / (b - a)
            draw_card(c, name, zoom=lerp(1.0, 1.1, lt), fy=0.45, cy=1010, scale=0.94)
            layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            for k in range(2):
                cloud_pop(layer, a + 0.08 + k * 0.25, t, W / 2 + (-170 + k * 340), 1650, size=44 + k * 6, life=0.9)
            c.alpha_composite(layer)
            break
    kicker(d, 190, "LE MOUTON   ×   YOONA", prog=(t - 0.05) / 0.4)
    headline(d, 300, "구름 위를 걷는 기분", size=84, prog=t / 0.5, fill=INK, font_path=F_XB)
    if t < 1.75:
        subline(d, 1770, "가볍게, 하루 종일", prog=(t - 0.35) / 0.4)
    else:
        subline(d, 1770, "벗고 싶지 않은 편안함", prog=(t - 1.75) / 0.4)

T_C1, T_C2 = T_N1 + 2.5, T_N1 + 4.1
@scene(T_N1, T_N2)
def s_secret(t, dur, c, d):
    c.paste(cream_bg(), (0, 0))
    if t < 2.5:
        wob = math.sin(t * 9.0)
        draw_card(c, "squeeze", zoom=lerp(1.25, 1.1, ease_out(t / 1.2)), cy=1010, scale=0.94,
                  angle=wob * 3.0 * clamp(1 - t / 2.5 + 0.3), sx=1 + 0.035 * wob)
        kicker(d, 190, "THE SECRET", prog=t / 0.4)
        headline(d, 300, "인생 신발의 비밀", size=84, prog=t / 0.5, fill=INK, font_path=F_XB)
        tag(d, (W / 2, 1600), "솜사탕처럼 말랑", prog=(t - 0.7) / 0.4, fill=CREAM)
        subline(d, 1770, "손으로 비틀어도 이 정도로 부드럽게", prog=(t - 1.2) / 0.4)
    elif t < 4.1:
        lt = t - 2.5
        draw_card(c, "wool", zoom=lerp(1.0, 1.15, ease_in_out(lt / 1.6)), cy=980, scale=0.94)
        kicker(d, 190, "PREMIUM MERINO WOOL", prog=lt / 0.4)
        headline(d, 300, "프리미엄 메리노 울", size=84, prog=lt / 0.45, fill=INK, font_path=F_XB)
        tag(d, (W / 2, 1380), "특허 원단 H1-TEX", prog=(lt - 0.5) / 0.4, fill=CREAM)
        subline(d, 1770, "발을 포근하게 감싸는 소재", prog=(lt - 0.9) / 0.4)
    else:
        lt = t - 4.1
        draw_card(c, "crosswalk", zoom=lerp(1.15, 1.3, ease_in_out(lt / 2.2)), fx=0.5, fy=0.62, cy=1010, scale=0.94)
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        pops = [(0.15, 440, 1420, 62), (0.6, 670, 1470, 54), (1.05, 480, 1500, 68), (1.5, 690, 1400, 58), (1.95, 545, 1460, 64)]
        for t0, x, y, sz in pops:
            cloud_pop(layer, t0, lt, x, y, size=sz, life=1.0)
        c.alpha_composite(layer)
        kicker(d, 170, "BAREFOOT FRIENDLY", prog=lt / 0.4)
        headline(d, 300, "맨발로 신어도\n뒤꿈치 안 까짐", size=78, prog=lt / 0.5, fill=INK, font_path=F_XB)
        subline(d, 1770, "깃털처럼 가벼운 무게", prog=(lt - 0.9) / 0.4)

CUTS_D = ["two_women", "man_steps", "yoona_office", "woman_europe", "pharmacist", "couple", "woman_walk"]
@scene(T_N2, T_N3)
def s_reviews(t, dur, c, d):
    step = dur / len(CUTS_D)
    i = min(int(t / step), len(CUTS_D) - 1); lt = (t - i * step) / step
    name = CUTS_D[i]
    c.paste(blurred_bg(name, dark=0.7), (0, 0))
    draw_card(c, name, zoom=lerp(1.0, 1.1, lt), fy=0.4, cy=900, scale=1.0, darken=0.82)
    top_gradient(c, 760, 190)
    kicker(d, 170, "REAL REVIEWS", prog=t / 0.4, fill=(220, 205, 190))
    headline(d, 270, "리뷰가 증명하는 편안함", size=80, prog=t / 0.5, fill=WHITE, font_path=F_XB)
    tag(d, (W / 2, 385), "실제 구매 후기", prog=(t - 0.3) / 0.4, fg=WHITE, line=(235, 225, 210))
    # notifications: appear every 1.3s, stack upward, max 3 visible
    times = [0.4 + k * 1.3 for k in range(len(REVIEWS))]
    shown = [k for k, t0 in enumerate(times) if t >= t0]
    base_y = 1640; gap = 275
    for k in shown:
        age = len(shown) - 1 - k        # 0 = newest
        if age > 2: continue
        prog = (t - times[k]) / 0.45
        slot_y = base_y - age * gap
        # smooth slide when a new card pushes older ones up
        if age > 0:
            push = clamp((t - times[shown[-1]]) / 0.35)
            slot_y = lerp(base_y - (age - 1) * gap, slot_y, ease_out(push))
        alpha = 1.0 if age < 2 else 1 - clamp((t - times[shown[-1]]) / 0.35) * 0.55
        notif_card(c, slot_y, REVIEWS[k][0], REVIEWS[k][1], prog, alpha)

@scene(T_N3, T_N4)
def s_week(t, dur, c, d):
    c.paste(Image.new("RGB", (W, H), CREAM), (0, 0))
    # brown top block sliding down
    e = ease_out(t / 0.5)
    d.rectangle((0, 0, W, int(760 * e)), fill=BROWN)
    if t > 0.2:
        p = ease_back(clamp((t - 0.2) / 0.5))
        d.text((W / 2, 200), "LE MOUTON", font=font(F_NUM, int(60 * p) or 8), fill=TAN, anchor="mm")
        d.text((W / 2, 400), "WEEK", font=font(F_BLACK, int(300 * p) or 8), fill=CREAM, anchor="mm")
    pill(d, (W / 2, 610), WEEK_DAYS, size=56, bg=RED, fg=WHITE, prog=(t - 0.7) / 0.35)
    # timer
    if t > 1.0:
        p = ease_out((t - 1.0) / 0.4)
        secs_total = TIMER_START[0] * 86400 + TIMER_START[1] * 3600 + TIMER_START[2] * 60 + TIMER_START[3] - int(t - 1.0)
        dd, r = divmod(secs_total, 86400); hh, r = divmod(r, 3600); mm, ss = divmod(r, 60)
        y = 900 - (1 - p) * 40
        d.text((W / 2, y - 90), "남은 시간", font=font(F_BOLD, 40), fill=(140, 120, 100), anchor="mm")
        d.text((W / 2, y), f"{dd:02d} : {hh:02d} : {mm:02d} : {ss:02d}", font=font(F_NUM, 120), fill=INK, anchor="mm")
        d.text((W / 2, y + 90), "일          시          분          초", font=font(F_MED, 32), fill=(160, 140, 120), anchor="mm")
    # discount line blinking
    if t > 1.6:
        on = int((t - 1.6) * 3) % 2 == 0
        col = RED if on else (230, 120, 100)
        d.text((W / 2, 1090), DISCOUNT_LINE, font=font(F_BLACK, 84), fill=col, anchor="mm")
    if t > 2.0:
        draw_card(c, "shoe_pair", zoom=lerp(1.0, 1.1, ease_in_out((t - 2.0) / (dur - 2.0))), cy=1500, scale=0.62)
    subline(d, 1860, "놓치면 1년 기다립니다", prog=(t - 2.6) / 0.4, size=36)

@scene(T_N4, TOTAL)
def s_cta(t, dur, c, d):
    name = "yoona_walk" if t < 3.2 else ("hold_shoes" if t < 6.2 else "shoe_navy")
    c.paste(blurred_bg(name, dark=0.8), (0, 0))
    lt = t if t < 3.2 else (t - 3.2 if t < 6.2 else t - 6.2)
    draw_card(c, name, zoom=lerp(1.0, 1.12, ease_in_out(lt / 3.0)), fy=0.45, cy=940, scale=0.96)
    # pulsing sold-out tag
    pulse = 1 + 0.05 * math.sin(t * 8)
    pill(d, (W / 2, 160), "인기 사이즈 소진 중", size=int(50 * pulse), bg=RED, fg=WHITE, prog=t / 0.35)
    top_gradient(c, 820, 200)
    if t < 3.2:
        headline(d, 330, "지금 안 사면\n다음엔 내 사이즈 없음", size=76, prog=(t - 0.3) / 0.5, fill=WHITE, font_path=F_XB)
    elif t < 6.2:
        headline(d, 330, "지친 발에게\n완벽한 휴식을", size=84, prog=(t - 3.2) / 0.5, fill=WHITE, font_path=F_XB)
    else:
        headline(d, 320, "르무통 위크", size=92, prog=(t - 6.2) / 0.5, fill=WHITE, font_path=F_XB)
        tag(d, (W / 2, 445), "르무통 공식 브랜드스토어", prog=(t - 6.5) / 0.4, fg=WHITE, line=(235, 225, 210))
    # bottom CTA block with bouncing chevrons
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

# ---------------------------------------------------------------- audio
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
        s = np.diff(s, prepend=0); s = np.diff(s, prepend=0)  # bright
        s = s / np.max(np.abs(s)) * np.exp(-np.arange(len(s)) / SR / 0.012)
        tn = tone(2400, 0.05, 0.01) * 0.4
        s[: len(tn)] += tn
        return s
    def whoosh(length=0.3):
        s = noise(length, lp=30, decay=10)
        t = np.arange(len(s)) / SR
        return s * np.sin(np.pi * t / length) ** 2
    def poof():
        return noise(0.18, lp=90, decay=0.06) * 0.8
    def notif():
        return tone(1318, 0.25, 0.08) * 0.6 + np.concatenate([np.zeros(int(0.09 * SR)), tone(1760, 0.3, 0.12)])[: int(0.25 * SR)] * 0.6
    def tick():
        return tone(3000, 0.03, 0.006)
    def riser(length=1.2):
        t = np.arange(int(length * SR)) / SR
        f = 200 + 900 * (t / length) ** 2
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / length) * 0.5 + noise(length, lp=20, decay=10) * (t / length) ** 2 * 0.5
    def pluck(freq, length=0.5):
        return tone(freq, length, 0.18, harm=(1, 2, 3)) * 0.5
    def pad(freqs, length):
        t = np.arange(int(length * SR)) / SR
        s = np.zeros_like(t)
        for f in freqs:
            s += np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * f * 1.005 * t)
        env = np.minimum(t / 0.4, 1) * np.minimum((length - t) / 0.4, 1)
        return s / len(freqs) * env

    # --- hook: heartbeat + drone
    for at in np.arange(0.2, T_SNAP - 0.3, 0.9):
        add(mix, heartbeat(), at, 0.8)
    t = np.arange(int(T_SNAP * SR)) / SR
    add(mix, np.sin(2 * np.pi * 55 * t) * 0.25 * np.minimum(t / 1.0, 1) * np.minimum((T_SNAP - t) / 0.3, 1), 0)
    add(mix, riser(0.9), T_SNAP - 0.9, 0.5)
    # --- snap + flash
    add(mix, snap(), T_SNAP, 1.0)
    add(mix, tone(1568, 1.2, 0.5, harm=(1, 2)), T_SNAP + 0.02, 0.25)

    # --- music bed from snap to end: 112 bpm, chords C Am F G, plucks
    bpm = 112; beat = 60 / bpm; bar = beat * 4
    chords = [(261.6, 329.6, 392.0), (220.0, 261.6, 329.6), (174.6, 220.0, 261.6), (196.0, 246.9, 293.7)]
    b = T_SNAP; k = 0
    while b < TOTAL - 0.3:
        ch = chords[(k // 4) % 4]
        if k % 4 == 0: add(music, pad([f / 2 for f in ch], bar + 0.2), b, 0.22)
        add(music, kick(soft=True), b, 0.5 if k % 2 == 0 else 0.35)
        add(music, noise(0.05, lp=1, decay=0.015), b + beat / 2, 0.10)  # shaker
        if k % 2 == 1: add(music, noise(0.12, lp=6, decay=0.04), b, 0.16)  # soft snare
        # arpeggio plucks on 8ths
        for j in range(2):
            f = ch[(k * 2 + j) % 3] * (2 if j == 1 else 1)
            add(music, pluck(f, beat), b + j * beat / 2, 0.16)
        b += beat; k += 1

    # --- narration
    for key, at in [("n0", T_N0), ("n1", T_N1), ("n2", T_N2), ("n3", T_N3), ("n4", T_N4)]:
        add(voice, load_wav(os.path.join(HERE, "tts", key + ".wav")), at, 1.0)
    # sidechain: duck music where voice is present
    env = np.convolve(np.abs(voice), np.ones(int(0.08 * SR)) / int(0.08 * SR), mode="same")
    duck = 1 - 0.6 * np.clip(env / 0.05, 0, 1)
    music *= duck

    # --- SFX
    for name, a, bb in CUTS_B: add(mix, whoosh(0.25), T_SNAP + a - 0.05, 0.35)
    for name, a, bb in CUTS_B:
        for kk in range(3): add(mix, poof(), T_SNAP + a + 0.05 + kk * 0.22, 0.45)
    for at in [T_C1, T_C2]: add(mix, whoosh(0.25), at - 0.05, 0.35)
    for t0 in [0.15, 0.6, 1.05, 1.5, 1.95]: add(mix, poof(), T_C2 + t0, 0.5)
    for kk in range(len(REVIEWS)): add(mix, notif(), T_N2 + 0.4 + kk * 1.3, 0.55)
    step = (T_N3 - T_N2) / len(CUTS_D)
    for kk in range(1, len(CUTS_D)): add(mix, whoosh(0.2), T_N2 + kk * step - 0.05, 0.25)
    add(mix, whoosh(0.4), T_N3 - 0.1, 0.5); add(mix, kick(), T_N3 + 0.2, 0.9)
    for at in np.arange(T_N3 + 1.0, T_N4, 1.0): add(mix, tick(), at, 0.35)
    add(mix, whoosh(0.3), T_N4 - 0.05, 0.4)
    for at in [T_N4 + 3.2, T_N4 + 6.2]: add(mix, whoosh(0.25), at - 0.05, 0.3)
    add(mix, riser(1.0), TOTAL - 1.6, 0.35); add(mix, tone(1046, 1.5, 0.6, harm=(1, 2, 3)), TOTAL - 0.6, 0.3)

    total = mix + music * 0.9 + voice * 1.15
    total = np.tanh(total * 1.1) * 0.95
    fo = int(0.6 * SR); total[-fo:] *= np.linspace(1, 0, fo)
    path = os.path.join(HERE, "audio.wav")
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
            fn(t - s, e - s, c, d)
            break
    # snap: cream circle wipe from the dark hook into the bright stage
    WIPE = 0.32
    if 0 <= t - T_SNAP < WIPE:
        old = Image.new("RGBA", (W, H), CREAM + (255,))
        s_hook(T_SNAP - 0.001, T_SNAP, old, ImageDraw.Draw(old, "RGBA"))
        r = ease_out((t - T_SNAP) / WIPE) * 1250
        m = Image.new("L", (W, H), 0)
        ImageDraw.Draw(m).ellipse((W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r), fill=255)
        ring = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        ImageDraw.Draw(ring).ellipse((W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r), outline=CREAM + (255,), width=18)
        c = Image.composite(c, old, m)
        c.alpha_composite(ring)
    return c.convert("RGB")

def main():
    only_stills = "--stills" in sys.argv
    stills = [0.9, 2.2, 3.4, 3.9, 4.6, 6.4, 8.4, 10.6, 12.6, 15.0, 19.6, 23.4, 28.4, 32.0, 35.8]
    if only_stills:
        for ts in stills:
            frame(int(ts * FPS)).resize((270, 480)).save(os.path.join(HERE, f"still_{int(ts*10):03d}.jpg"), quality=85)
        print("stills ok"); return
    audio = synth(); print("audio ok", round(TOTAL, 2), "s")
    cmd = [FFMPEG, "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
           "-i", audio, "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for i in range(N):
        p.stdin.write(frame(i).tobytes())
        if i % 150 == 0: print(f"frame {i}/{N}")
    p.stdin.close(); p.wait(); print("done", OUT, p.returncode)
    for ts in stills:
        frame(int(ts * FPS)).resize((270, 480)).save(os.path.join(HERE, f"still_{int(ts*10):03d}.jpg"), quality=85)

if __name__ == "__main__":
    main()
