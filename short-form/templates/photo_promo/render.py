# -*- coding: utf-8 -*-
"""photo_promo — 제품 사진 N장 + AI 스크립트(장면 카피·내레이션) → 1080x1920 30fps 모션그래픽 숏폼.
영상 생성 API 없음. 입력은 SF_JOB(job.json): script, assets(로컬 이미지 경로 목록).
장면 레이아웃은 role 에 따라 자동: hook=풀블리드 어둡게+큰 카피, benefit=카드+상단 카피(좌우 교대), proof=풀블리드+태그, offer=밝은 배경+뱃지.
"""
import os, sys, math, random
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sf_common import *  # noqa

random.seed(3)
job = load_job()
script = job["script"]
assets = [p for p in job["assets"] if os.path.exists(p)]
if len(assets) < 2:
    raise SystemExit("사진이 2장 이상 필요합니다.")

# ---------------------------------------------------------------- assets
_src = {}
def src(i):
    p = assets[i % len(assets)]
    if p not in _src:
        im = Image.open(p).convert("RGB")
        if max(im.size) > 2400:
            im.thumbnail((2400, 2400), Image.LANCZOS)
        _src[p] = im
    return _src[p]

_bg = {}
def blurred_bg(i, dark=0.5):
    k = (i % len(assets), dark)
    if k not in _bg:
        im = cover(src(i), W, H).filter(ImageFilter.GaussianBlur(30))
        _bg[k] = ImageEnhance.Brightness(im).enhance(dark)
    return _bg[k]

def kenburns(c, i, t, dur, dark=1.0, z0=1.0, z1=1.08, fx=0.5, fy=0.5, dx=0.0):
    p = ease_in_out(t / max(dur, 0.1))
    im = cover(src(i), W, H, fx=clamp(fx + dx * p, 0.15, 0.85), fy=fy, zoom=lerp(z0, z1, p))
    if dark != 1.0: im = ImageEnhance.Brightness(im).enhance(dark)
    c.paste(im, (0, 0))

def card(c, i, t, dur, cy=1000, w=900, h=1120, z0=1.0, z1=1.06, prog=1.0):
    p = ease_in_out(t / max(dur, 0.1))
    im = cover(src(i), w, h, zoom=lerp(z0, z1, p))
    e = ease_back(clamp(prog))
    dw, dh = max(2, int(w * e)), max(2, int(h * e))
    if (dw, dh) != (w, h): im = im.resize((dw, dh), Image.BILINEAR)
    layer = Image.new("RGBA", (dw, dh)); layer.paste(im, (0, 0)); layer.putalpha(rounded_mask(dw, dh))
    sh = shadow(dw, dh)
    c.alpha_composite(sh, (int(W / 2 - sh.width / 2), int(cy - sh.height / 2)))
    c.alpha_composite(layer, (int(W / 2 - dw / 2), int(cy - dh / 2)))

# ---------------------------------------------------------------- scenes
scenes = script["scenes"]
durs = tts(script)
timeline, TOTAL = build_timeline(script, durs, "photos")
print("timeline", [(s, round(a, 1), round(b, 1)) for s, a, b in timeline], "total", round(TOTAL, 1), flush=True)

# 장면→사진 배정: 순서대로 순환하되 hook 은 0번, 같은 사진 연속 회피
assign = {}
used = 0
for k, sc in enumerate(scenes):
    assign[sc["id"]] = k % len(assets)

def draw_scene(k, sc, t, dur, c, d):
    role = sc.get("role", "benefit")
    i = assign[sc["id"]]
    left = k % 2 == 1
    if role == "hook":
        kenburns(c, i, t, dur, dark=0.55, z0=1.0, z1=1.1)
        gradient(c, top=False, h=1150, alpha=215); gradient(c, top=True, h=500, alpha=150)
        brand_mark(d, script.get("brand", ""), y=210, prog=t / 0.5)
        headline(d, 1180, sc["headline"], size=104, prog=(t - 0.25) / 0.6, path=F_BLACK)
        rule(d, 1420, prog=(t - 1.1) / 0.5)
        subline(d, 1500, sc["sub"], prog=(t - 1.3) / 0.5, fill=(215, 205, 195), size=36)
        kicker(d, 1740, sc["kicker"], prog=(t - 1.8) / 0.4, fill=(180, 168, 155))
    elif role == "proof":
        kenburns(c, i, t, dur, dark=0.8, z0=1.04, z1=1.0, dx=0.08)
        gradient(c, top=True, h=760, alpha=200); gradient(c, top=False, h=800, alpha=170)
        kicker(d, 170, sc["kicker"], prog=t / 0.4, fill=(225, 215, 200))
        headline(d, 320, sc["headline"], size=84, prog=t / 0.5)
        tag(d, (W / 2, 470), "실제 사용 기준" if not sc.get("sub") else sc["sub"][:22], prog=(t - 0.5) / 0.4, line=(235, 225, 210))
        # 하단 인용 카드
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
            c.alpha_composite(layer, (int(W / 2 - layer.width / 2), int(1500 - layer.height / 2 + (1 - e) * 120)))
    elif role == "offer":
        c.paste(Image.new("RGB", (W, H), CREAM), (0, 0))
        e = ease_out(t / 0.5)
        d.rectangle((0, 0, W, int(700 * e)), fill=INK)
        brand_mark(d, script.get("brand", ""), y=170, prog=(t - 0.2) / 0.4, fill=(200, 190, 178))
        headline(d, 400, sc["headline"], size=104, prog=(t - 0.3) / 0.5, fill=CREAM, path=F_BLACK, max_w=920)
        pill(d, (W / 2, 640), sc["kicker"], size=52, prog=(t - 0.8) / 0.35)
        if t > 1.0:
            on = int((t - 1.0) * 3) % 2 == 0
            f, lines = fit_font(sc["sub"], F_BLACK, 74, 900, min_size=44, max_lines=2)
            for j, ln in enumerate(lines):
                d.text((W / 2, 860 + j * f.size * 1.2), ln, font=f, fill=ACCENT if on else (230, 120, 100), anchor="mm")
        if t > 1.3:
            card(c, i, t, dur, cy=1440, w=720, h=640, prog=(t - 1.3) / 0.5)
        subline(d, 1850, sc.get("narration", "")[:28], prog=(t - 2.0) / 0.4, fill=(120, 108, 96), size=32)
    else:  # benefit / cta(중간 cta 도 카드형)
        c.paste(blurred_bg(i, 0.5), (0, 0))
        vignette(c, 80)
        card(c, i, t, dur, cy=1110, w=920, h=1180, z0=1.0, z1=1.07, prog=t / 0.5)
        gradient(c, top=True, h=640, alpha=190)
        kicker(d, 150, sc["kicker"], prog=t / 0.4, align="left" if left else "center", x=90)
        headline(d, 300, sc["headline"], size=88, prog=(t - 0.15) / 0.5, align="left" if left else "center", x=90, max_w=900)
        subline(d, 470 if "\n" in sc["headline"] or len(sc["headline"]) > 12 else 420, sc["sub"], prog=(t - 0.7) / 0.4,
                fill=(225, 218, 208), size=36, align="left" if left else "center", x=90)

def frame(i):
    t = i / FPS
    c = Image.new("RGBA", (W, H), INK + (255,))
    d = ImageDraw.Draw(c, "RGBA")
    for k, (sid, s0, s1) in enumerate(timeline):
        if s0 <= t < s1 or (k == len(timeline) - 1 and t >= s0):
            if sid == "cta_end":
                end_card(c, d, t - s0, s1 - s0, script, bg_img=src(len(scenes)))
            else:
                draw_scene(k, scenes[k], t - s0, s1 - s0, c, d)
            # 장면 시작 크로스페이드 (0.35s)
            X = 0.35
            if k > 0 and t - s0 < X:
                prev_id, p0, p1 = timeline[k - 1]
                old = Image.new("RGBA", (W, H), INK + (255,))
                od = ImageDraw.Draw(old, "RGBA")
                if prev_id == "cta_end":
                    end_card(old, od, p1 - p0 - 0.001, p1 - p0, script)
                else:
                    draw_scene(k - 1, scenes[k - 1], p1 - p0 - 0.001, p1 - p0, old, od)
                c = Image.blend(old, c, ease_out((t - s0) / X))
            break
    return c.convert("RGB")

def main():
    audio = synth_audio(TOTAL, timeline, script)
    print("audio ok", round(TOTAL, 2), "s", flush=True)
    stills = [a + 1.2 for _, a, _ in timeline] + [TOTAL - 0.5]
    encode(frame, TOTAL, audio, stills_at=stills + [TOTAL * k / 14 for k in range(14 - len(stills))])

if __name__ == "__main__":
    main()
