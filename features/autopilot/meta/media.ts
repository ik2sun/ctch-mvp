// 캠페인 오토파일럿 · 메타 소재 파일(브라우저) — 이미지·영상 크기 읽기, 영상 썸네일 프레임, 큰 이미지 줄이기
import { uid, type MediaItem } from "./model";

export type LocalMedia = MediaItem & { file: File };

export const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime";
export const VIDEO_MAX = 200 * 1024 * 1024; // 스토리지 버킷 한도
const IMAGE_SEND_MAX = 4 * 1024 * 1024; // Vercel 본문 4.5MB

function videoMeta(url: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () => resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
    v.onerror = () => reject(new Error("영상을 읽지 못했어요(코덱 확인)"));
    v.src = url;
  });
}

export async function readMedia(file: File): Promise<LocalMedia> {
  const url = URL.createObjectURL(file);
  const base = { id: uid("m"), name: file.name, size: file.size, url, file };
  if (file.type.startsWith("video/")) {
    if (file.size > VIDEO_MAX) throw new Error(`${file.name}: 영상은 200MB까지`);
    const m = await videoMeta(url);
    return { ...base, kind: "video", width: m.width, height: m.height, duration: m.duration };
  }
  const bmp = await createImageBitmap(file);
  const out: LocalMedia = { ...base, kind: "image", width: bmp.width, height: bmp.height };
  bmp.close();
  return out;
}

function toBlob(canvas: HTMLCanvasElement, type: string, q?: number): Promise<Blob> {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("이미지 변환 실패"))), type, q));
}

// 4MB 넘는 이미지는 같은 크기로 JPEG 품질만 낮춰(필요하면 긴 변 2160px로) 보낸다
export async function imageForUpload(m: LocalMedia): Promise<Blob> {
  if (m.file.size <= IMAGE_SEND_MAX) return m.file;
  const bmp = await createImageBitmap(m.file);
  const scale = Math.min(1, 2160 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  for (const q of [0.92, 0.85, 0.75, 0.6]) {
    const b = await toBlob(c, "image/jpeg", q);
    if (b.size <= IMAGE_SEND_MAX) return b;
  }
  return toBlob(c, "image/jpeg", 0.5);
}

// 영상 썸네일 — 1초 지점(짧으면 10%) 프레임을 JPEG로
export function videoThumbnail(m: LocalMedia): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.src = m.url;
    v.onloadeddata = () => {
      v.currentTime = Math.min(1, (m.duration ?? 1) * 0.1);
    };
    v.onseeked = async () => {
      try {
        const c = document.createElement("canvas");
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext("2d")!.drawImage(v, 0, 0);
        resolve(await toBlob(c, "image/jpeg", 0.9));
      } catch (e) {
        reject(e);
      }
    };
    v.onerror = () => reject(new Error("썸네일을 만들지 못했어요"));
  });
}

export const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.round(n / 1024)}KB`);
export const fmtDur = (s?: number) => (s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
