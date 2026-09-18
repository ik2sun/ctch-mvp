// 광고 소재 렌더러 (브라우저 canvas) — 이미지 1장 → 매체 규격별 크롭 + 카피·로고·CTA 오버레이.
// ffmpeg·워커 없이 브라우저에서 바로 그린다. 원본은 /api/proxy-image 로 받아 canvas 오염(CORS)을 피한다.

export type AdFormat = { id: string; label: string; w: number; h: number; media: string; safeTop?: number; safeBottom?: number };

export const AD_FORMATS: AdFormat[] = [
  { id: "square", label: "1:1 피드", w: 1080, h: 1080, media: "메타·네이버·카카오 피드" },
  { id: "portrait", label: "4:5 피드", w: 1080, h: 1350, media: "인스타·페이스북 피드" },
  // 릴스·스토리는 상단 프로필(약 14%)·하단 캡션·버튼(약 20%) 영역을 비운다
  { id: "story", label: "9:16 스토리·릴스", w: 1080, h: 1920, media: "릴스·스토리·쇼츠", safeTop: 0.14, safeBottom: 0.2 },
  { id: "landscape", label: "1.91:1 가로", w: 1200, h: 628, media: "GDN·메타 링크·카카오 디스플레이" },
];

export type AdCopy = { headline: string; sub: string; badge: string; cta: string };
export type AdTheme = "dark" | "light" | "brand";
export type AdStyle = {
  showCopy: boolean;
  position: "top" | "bottom";
  theme: AdTheme;
  accent: string;
  logo: HTMLImageElement | null;
};

const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', sans-serif";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지를 불러오지 못했어요."));
    img.src = src;
  });
}

// 꽉 채워 자르되, 원본의 초점(fx, fy: 0~1)이 결과 화면의 (tx, ty) 지점에 오도록 한다.
// 카피가 있으면 tx·ty 를 글자 없는 쪽으로 옮겨 제품이 문구에 가려지지 않게 한다.
// zoom(1~2)으로 확대하면 자를 여유가 생겨 초점을 옮길 수 있다.
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number, fx: number, fy: number, tx = 0.5, ty = 0.5, zoom = 1) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const s = Math.max(W / iw, H / ih) * Math.max(1, zoom);
  const sw = W / s;
  const sh = H / s;
  const sx = clamp(fx * iw - sw * tx, 0, iw - sw);
  const sy = clamp(fy * ih - sh * ty, 0, ih - sh);
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
}

// 한국어 줄바꿈: 띄어쓰기 단위로 채우고, 한 단어가 너무 길면 글자 단위로 끊는다. 명시적 \n 은 유지.
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxW) {
        line = next;
        continue;
      }
      if (line) out.push(line);
      if (ctx.measureText(word).width <= maxW) {
        line = word;
        continue;
      }
      line = "";
      for (const ch of word) {
        if (ctx.measureText(line + ch).width > maxW && line) {
          out.push(line);
          line = ch;
        } else line += ch;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, min: number, maxLines: number, weight: number) {
  let s = size;
  for (;;) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines || s <= min) return { lines: lines.slice(0, maxLines), size: s };
    s = Math.max(min, Math.round(s * 0.9));
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexA(hex: string, a: number) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// canvas 에 한 장을 그린다. scale 은 미리보기용 축소 배율 (저장은 1)
export function renderAd(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  f: AdFormat,
  copy: AdCopy,
  style: AdStyle,
  focal: { x: number; y: number; zoom?: number },
  scale = 1,
) {
  const W = f.w;
  const H = f.h;
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingQuality = "high";

  const land = W / H > 1.4;
  const hasCopy = style.showCopy && Boolean(copy.headline.trim() || copy.sub.trim() || copy.badge.trim() || copy.cta.trim());
  const tx = hasCopy && land ? 0.74 : 0.5;
  const ty = hasCopy && !land ? (style.position === "bottom" ? 0.38 : 0.62) : 0.5;
  drawCover(ctx, img, W, H, focal.x, focal.y, tx, ty, focal.zoom ?? 1);

  const unit = land ? H : W; // 글자 크기 기준
  const mx = Math.round(unit * (land ? 0.09 : 0.075));
  const top = Math.round(H * (f.safeTop ?? 0.06));
  const bottom = Math.round(H * (f.safeBottom ?? 0.07));

  // 로고 — 좌상단 (문구가 위쪽이면 우하단으로)
  const logoH = Math.round(unit * (land ? 0.1 : 0.06));
  const drawLogo = () => {
    if (!style.logo) return;
    const lw = Math.min((style.logo.naturalWidth / style.logo.naturalHeight) * logoH, W * 0.32);
    const lh = (lw / style.logo.naturalWidth) * style.logo.naturalHeight;
    const atTop = !style.showCopy || style.position === "bottom" || land;
    const x = atTop ? mx : W - mx - lw;
    const y = atTop ? top : H - bottom - lh;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 12;
    ctx.drawImage(style.logo, x, y, lw, lh);
    ctx.restore();
  };

  if (!hasCopy) {
    drawLogo();
    return;
  }

  // ---- 문구 블록 측정
  const textW = land ? W * 0.5 : W - mx * 2;
  const onDark = style.theme !== "light";
  const ink = onDark ? "#FFFFFF" : "#15181E";
  const subInk = onDark ? "rgba(255,255,255,0.86)" : "#3B4048";
  const hl = copy.headline.trim() ? fit(ctx, copy.headline.trim(), textW, Math.round(unit * (land ? 0.12 : 0.078)), Math.round(unit * 0.045), 3, 800) : null;
  const sb = copy.sub.trim() ? fit(ctx, copy.sub.trim(), textW, Math.round(unit * (land ? 0.056 : 0.036)), Math.round(unit * 0.026), 2, 500) : null;
  const badgeSize = Math.round(unit * (land ? 0.045 : 0.03));
  const ctaSize = Math.round(unit * (land ? 0.05 : 0.034));
  const gap = Math.round(unit * 0.022);

  const blocks: { h: number; draw: (y: number, x: number) => void }[] = [];
  if (copy.badge.trim()) {
    ctx.font = `700 ${badgeSize}px ${FONT}`;
    const bw = ctx.measureText(copy.badge.trim()).width + badgeSize * 1.3;
    const bh = badgeSize * 1.75;
    blocks.push({
      h: bh,
      draw: (y, x) => {
        ctx.font = `700 ${badgeSize}px ${FONT}`;
        ctx.fillStyle = style.theme === "brand" ? "#FFFFFF" : style.accent;
        roundRect(ctx, x, y, bw, bh, bh / 2);
        ctx.fill();
        ctx.fillStyle = style.theme === "brand" ? style.accent : "#FFFFFF";
        ctx.textBaseline = "middle";
        ctx.fillText(copy.badge.trim(), x + badgeSize * 0.65, y + bh / 2 + 1);
      },
    });
  }
  if (hl) {
    const lh = hl.size * 1.22;
    blocks.push({
      h: lh * hl.lines.length,
      draw: (y, x) => {
        ctx.font = `800 ${hl.size}px ${FONT}`;
        ctx.fillStyle = ink;
        ctx.textBaseline = "top";
        if (onDark) {
          ctx.shadowColor = "rgba(0,0,0,0.35)";
          ctx.shadowBlur = hl.size * 0.25;
        }
        hl.lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
        ctx.shadowBlur = 0;
      },
    });
  }
  if (sb) {
    const lh = sb.size * 1.4;
    blocks.push({
      h: lh * sb.lines.length,
      draw: (y, x) => {
        ctx.font = `500 ${sb.size}px ${FONT}`;
        ctx.fillStyle = subInk;
        ctx.textBaseline = "top";
        sb.lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
      },
    });
  }
  if (copy.cta.trim()) {
    ctx.font = `700 ${ctaSize}px ${FONT}`;
    const label = `${copy.cta.trim()}  →`;
    const cw = ctx.measureText(label).width + ctaSize * 1.8;
    const ch = ctaSize * 2.3;
    blocks.push({
      h: ch,
      draw: (y, x) => {
        ctx.font = `700 ${ctaSize}px ${FONT}`;
        ctx.fillStyle = style.theme === "brand" ? "#FFFFFF" : style.accent;
        roundRect(ctx, x, y, cw, ch, ch * 0.28);
        ctx.fill();
        ctx.fillStyle = style.theme === "brand" ? style.accent : "#FFFFFF";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x + ctaSize * 0.9, y + ch / 2 + 1);
      },
    });
  }
  const total = blocks.reduce((a, b) => a + b.h, 0) + gap * (blocks.length - 1);

  // ---- 배경 처리 + 위치
  const panelPad = Math.round(unit * 0.04);
  let x0 = mx;
  let y0: number;
  if (land) {
    y0 = Math.round((H - total) / 2);
    if (style.logo) y0 = Math.max(y0, top + logoH + gap); // 가로형은 로고가 좌상단이라 겹치지 않게
    if (style.theme === "dark") {
      const g = ctx.createLinearGradient(0, 0, W * 0.72, 0);
      g.addColorStop(0, "rgba(0,0,0,0.78)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = style.theme === "light" ? "rgba(255,255,255,0.93)" : hexA(style.accent, 0.92);
      ctx.fillRect(0, 0, textW + mx * 2, H);
    }
  } else {
    y0 = style.position === "bottom" ? H - bottom - total : top;
    if (style.theme === "dark") {
      const reach = total + H * 0.22;
      const g =
        style.position === "bottom"
          ? ctx.createLinearGradient(0, H, 0, H - bottom - reach)
          : ctx.createLinearGradient(0, 0, 0, top + reach);
      g.addColorStop(0, "rgba(0,0,0,0.82)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else {
      const px = mx - panelPad;
      ctx.fillStyle = style.theme === "light" ? "rgba(255,255,255,0.93)" : hexA(style.accent, 0.92);
      roundRect(ctx, px, y0 - panelPad, W - px * 2, total + panelPad * 2, Math.round(unit * 0.03));
      ctx.fill();
      x0 = mx + Math.round(panelPad * 0.25);
    }
  }

  let y = y0;
  for (const b of blocks) {
    b.draw(y, x0);
    y += b.h + gap;
  }
  drawLogo();
}

export function canvasBlob(canvas: HTMLCanvasElement, type = "image/jpeg", quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))), type, quality));
}
