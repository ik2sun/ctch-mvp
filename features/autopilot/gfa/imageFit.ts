// 캠페인 오토파일럿 · GFA 소재 이미지 — 브라우저 canvas로 템플릿 규격(가로×세로)에 맞춰 가운데 잘라 채우고,
// GFA 파일 크기 상·하한(템플릿마다 다름, 예 정사각 80KB~800KB) 안에 들어오게 JPEG 품질을 찾는다.
// 벌크 업로드는 이미지가 수백 장일 수 있어 원본 디코딩(ImageBitmap)은 자를 때만 만들고 바로 닫는다.
import type { TemplateSpec } from "./types";

export type SourceImage = { id: string; file: File; url: string; width: number; height: number; source: "pc" | "drive" };

let seq = 0;
export async function readImage(file: File, source: SourceImage["source"] = "pc"): Promise<SourceImage> {
  const bitmap = await createImageBitmap(file);
  const out = { id: `img${++seq}`, file, url: URL.createObjectURL(file), width: bitmap.width, height: bitmap.height, source };
  bitmap.close();
  return out;
}

export function releaseImage(img: SourceImage) {
  URL.revokeObjectURL(img.url);
}

async function draw(src: SourceImage, w: number, h: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(src.file);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  const scale = Math.max(w / bitmap.width, h / bitmap.height); // cover
  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;
  ctx.drawImage(bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh);
  bitmap.close();
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))), type, quality));
}

// 잘라 낸 원본보다 크게 늘리는 비율 — 1.5배를 넘으면 화면에 흐림 경고
export function upscaleRatio(src: { width: number; height: number }, t: TemplateSpec) {
  return Math.max(t.width / src.width, t.height / src.height);
}

export async function fitToTemplate(src: SourceImage, t: TemplateSpec): Promise<File> {
  const canvas = await draw(src, t.width, t.height);
  const min = t.minFileSize ?? 0;
  const max = t.maxFileSize;
  let lo = 0.4;
  let hi = 0.97;
  let best: Blob | null = null;
  // 품질 이분 탐색: max 이하 중 가장 높은 품질
  for (let i = 0; i < 7; i++) {
    const q = (lo + hi) / 2;
    const b = await toBlob(canvas, "image/jpeg", q);
    if (b.size <= max) {
      best = b;
      lo = q;
    } else hi = q;
  }
  if (!best) best = await toBlob(canvas, "image/jpeg", 0.35);
  if (best.size < min) {
    // 단색 위주 이미지는 JPEG가 너무 작게 나온다 → 최고 품질, 그래도 작으면 PNG
    const top = await toBlob(canvas, "image/jpeg", 1);
    if (top.size >= min && top.size <= max) best = top;
    if (best.size < min) {
      const png = await toBlob(canvas, "image/png");
      if (png.size >= min && png.size <= max) best = png;
    }
  }
  const ext = best.type === "image/png" ? "png" : "jpg";
  const base = src.file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "image";
  return new File([best], `${base}_${t.width}x${t.height}.${ext}`, { type: best.type });
}
