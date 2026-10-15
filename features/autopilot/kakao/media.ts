// 캠페인 오토파일럿 · 카카오 소재 파일(브라우저) — 형식별 규격에 맞추기
//  · 비즈보드: 1029×258 PNG 300KB(비율이 다르면 막음 — 글자 위주라 자르지 않는다)
//  · 네이티브: 1:1·2:1·9:16·4:5 중 가까운 비율로 가운데 잘라 JPEG 500KB 이하
//  · 프로필: 1:1 300px 이상 500KB · 동영상 썸네일: 영상 비율 그대로 JPEG 500KB
// 파일 읽기·영상 썸네일 프레임은 메타와 같은 함수를 쓴다
import { readMedia, videoThumbnail, type LocalMedia } from "../meta/media";
import { BANNER_SPEC, NATIVE_SPECS, PROFILE_SPEC, THUMB_MAX, nearestSpec, type KakaoFormat, type Spec } from "./model";

export { readMedia, videoThumbnail, type LocalMedia };
export const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime";
export const VIDEO_MAX = 200 * 1024 * 1024; // 스토리지 버킷 한도

function toBlob(canvas: HTMLCanvasElement, type: string, q?: number): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("이미지 변환 실패"))), type, q));
}

async function draw(src: Blob, w: number, h: number, bg = "#FFFFFF"): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(src);
  const sw = bmp.width;
  const sh = bmp.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  const scale = Math.max(w / sw, h / sh); // 가운데 맞춰 채우기(cover)
  ctx.drawImage(bmp, (w - sw * scale) / 2, (h - sh * scale) / 2, sw * scale, sh * scale);
  bmp.close();
  return c;
}

// JPEG 품질 이분 탐색 — 상한 이하 중 가장 높은 품질
async function jpegUnder(c: HTMLCanvasElement, max: number): Promise<Blob> {
  let lo = 0.4;
  let hi = 0.95;
  let best: Blob | null = null;
  for (let i = 0; i < 7; i++) {
    const q = (lo + hi) / 2;
    const b = await toBlob(c, "image/jpeg", q);
    if (b.size <= max) {
      best = b;
      lo = q;
    } else hi = q;
  }
  return best ?? toBlob(c, "image/jpeg", 0.3);
}

// 출력 크기 — 규격 최소 크기 이상, 원본이 크면 최대 2배까지(용량 한도 안에서 선명하게)
const outSize = (m: { width: number; height: number }, s: Spec) => {
  const k = Math.min(2, Math.max(1, Math.min(m.width / s.minW, m.height / s.minH)));
  return { w: Math.round(s.minW * k), h: Math.round(s.minH * k) };
};

export async function fitImage(m: LocalMedia, format: KakaoFormat): Promise<{ blob: Blob; ext: "png" | "jpg" }> {
  if (format === "IMAGE_BANNER") {
    const s = BANNER_SPEC;
    if (m.width === 1029 && m.height === 258 && m.file.type === "image/png" && m.file.size <= s.maxBytes) return { blob: m.file, ext: "png" };
    const png = await toBlob(await draw(m.file, 1029, 258), "image/png");
    if (png.size > s.maxBytes) throw new Error(`${m.name}: PNG로 바꾸면 ${Math.round(png.size / 1024)}KB — 비즈보드는 300KB 이하(색 수를 줄여 1029×258 PNG로 다시 저장해 올려 주세요)`);
    return { blob: png, ext: "png" };
  }
  const s = nearestSpec(m.width, m.height, NATIVE_SPECS);
  const exact = Math.abs(m.width / m.height / s.ratio - 1) < 0.005 && m.width >= s.minW && m.height >= s.minH;
  if (exact && /^image\/(jpeg|png)$/.test(m.file.type) && m.file.size <= s.maxBytes) return { blob: m.file, ext: m.file.type === "image/png" ? "png" : "jpg" };
  let { w, h } = outSize(m, s);
  for (;;) {
    const b = await jpegUnder(await draw(m.file, w, h), s.maxBytes);
    if (b.size <= s.maxBytes || w <= s.minW) return { blob: b, ext: "jpg" };
    w = Math.max(s.minW, Math.round(w * 0.8));
    h = Math.max(s.minH, Math.round(h * 0.8));
  }
}

export async function fitProfile(m: LocalMedia): Promise<Blob> {
  const side = Math.min(600, Math.max(PROFILE_SPEC.minW, Math.min(m.width, m.height)));
  return jpegUnder(await draw(m.file, side, side), PROFILE_SPEC.maxBytes);
}

// 동영상 맞춤 썸네일 — 따로 올린 이미지가 있으면 그것, 없으면 영상 첫 장면. 영상 비율 그대로(카카오: 720×1280·1280×720·1080×1080 이상)
export async function videoThumb(video: LocalMedia, custom: LocalMedia | null): Promise<Blob | null> {
  const ratio = video.width / video.height;
  const w = ratio < 0.8 ? 720 : ratio > 1.25 ? 1280 : 1080;
  const h = ratio < 0.8 ? 1280 : ratio > 1.25 ? 720 : 1080;
  try {
    const src = custom ? custom.file : await videoThumbnail(video);
    return await jpegUnder(await draw(src, w, h, "#000000"), THUMB_MAX);
  } catch {
    return null; // 썸네일 없이도 소재는 만들어진다(카카오가 영상에서 뽑음)
  }
}
