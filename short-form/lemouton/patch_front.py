# -*- coding: utf-8 -*-
"""Restyle the front half of render.py: minimal typographic hook, cream stage, no stroked captions."""
import re, io, sys
sys.stdout.reconfigure(encoding="utf-8")
P = "render.py"
s = open(P, encoding="utf-8").read()

def rep(old, new, count=1):
    global s
    assert s.count(old) >= 1, "missing: " + old[:60]
    s = s.replace(old, new, count)

# 1) new helpers, inserted before the timeline block
helpers = r'''
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
'''
rep("# ---------------------------------------------------------------- timeline\n", helpers)

# 2) replace hook / bright / secret scenes
start = s.index("@scene(0.0, T_SNAP)")
end = s.index("CUTS_D = ")
new_scenes = r'''@scene(0.0, T_SNAP)
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

'''
s = s[:start] + new_scenes + s[end:]

# 3) reviews / week / cta polish: no stroked headlines, tags instead of pills
rep('''    headline(d, 250, "리뷰가 증명하는 편안함", size=84, prog=t / 0.5, fill=WHITE, stroke=8, stroke_fill=BROWN)
    pill(d, (W / 2, 370), "실제 구매 후기", size=38, bg=GOLD, fg=INK, prog=(t - 0.3) / 0.35)''',
'''    top_gradient(c, 760, 190)
    kicker(d, 170, "REAL REVIEWS", prog=t / 0.4, fill=(220, 205, 190))
    headline(d, 270, "리뷰가 증명하는 편안함", size=80, prog=t / 0.5, fill=WHITE, font_path=F_XB)
    tag(d, (W / 2, 385), "실제 구매 후기", prog=(t - 0.3) / 0.4, fg=WHITE, line=(235, 225, 210))''')
rep('''    caption(d, 1860, "놓치면 1년 기다립니다", size=52, prog=(t - 2.6) / 0.3, fill=INK, stroke_fill=CREAM)''',
'''    subline(d, 1860, "놓치면 1년 기다립니다", prog=(t - 2.6) / 0.4, size=36)''')
rep('''    if t < 3.2:
        headline(d, 320, "지금 안 사면\\n다음엔 내 사이즈 없음", size=80, prog=(t - 0.3) / 0.5, fill=WHITE, stroke=8, stroke_fill=BROWN)
    elif t < 6.2:
        headline(d, 320, "지친 발에게\\n완벽한 휴식을", size=88, prog=(t - 3.2) / 0.5, fill=WHITE, stroke=8, stroke_fill=BROWN)
    else:
        headline(d, 320, "르무통 위크", size=96, prog=(t - 6.2) / 0.5, fill=WHITE, stroke=8, stroke_fill=BROWN)
        pill(d, (W / 2, 440), "르무통 공식 브랜드스토어", size=40, bg=WHITE, fg=BROWN, prog=(t - 6.5) / 0.35)''',
'''    top_gradient(c, 820, 200)
    if t < 3.2:
        headline(d, 330, "지금 안 사면\\n다음엔 내 사이즈 없음", size=76, prog=(t - 0.3) / 0.5, fill=WHITE, font_path=F_XB)
    elif t < 6.2:
        headline(d, 330, "지친 발에게\\n완벽한 휴식을", size=84, prog=(t - 3.2) / 0.5, fill=WHITE, font_path=F_XB)
    else:
        headline(d, 320, "르무통 위크", size=92, prog=(t - 6.2) / 0.5, fill=WHITE, font_path=F_XB)
        tag(d, (W / 2, 445), "르무통 공식 브랜드스토어", prog=(t - 6.5) / 0.4, fg=WHITE, line=(235, 225, 210))''')

# 4) alpha-blended drawing + circular cream wipe instead of white flash
rep('''    c = Image.new("RGBA", (W, H), CREAM + (255,))
    d = ImageDraw.Draw(c)
    for s, e, fn in SCENES:
        if s <= t < e:
            fn(t - s, e - s, c, d)
            break
    # snap flash
    if 0 <= t - T_SNAP < 0.14:
        c = Image.blend(c, Image.new("RGBA", (W, H), (255, 255, 255, 255)), 1 - (t - T_SNAP) / 0.14)
    return c.convert("RGB")''',
'''    c = Image.new("RGBA", (W, H), CREAM + (255,))
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
    return c.convert("RGB")''')

# headline: allow RGBA fills (fade) even when fill has 3 comps -> already handled; ensure alpha tuple concat works
rep('''        d.text((W / 2, y0 + i * lh + (1 - e) * 40), ln, font=f, fill=fill + ((int(255 * e),) if len(fill) == 3 else ()), anchor="mm", stroke_width=stroke, stroke_fill=stroke_fill)''',
'''        d.text((W / 2, y0 + i * lh + (1 - e) * 40), ln, font=f, fill=fill + (int(255 * e),), anchor="mm", stroke_width=stroke, stroke_fill=stroke_fill)''')

# stills list: focus on the front half plus a few later
rep('''    stills = [1.2, 3.0, 4.2, 6.0, 8.2, 10.4, 12.4, 14.4, 17.6, 19.8, 22.4, 24.8, 28.0, 31.5, 35.5]''',
'''    stills = [0.9, 2.2, 3.4, 3.9, 4.6, 6.4, 8.4, 10.6, 12.6, 15.0, 19.6, 23.4, 28.4, 32.0, 35.8]''')

open(P, "w", encoding="utf-8").write(s)
print("patched")
