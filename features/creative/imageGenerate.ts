import { generateImage as higgsfieldImage } from "@/lib/higgsfield/client";
import { IMAGE_METHOD_BY_ID, type ImageMethodId } from "./imageMethods";

// 서버 전용 — 이미지 생성 방법별 API 호출. route(/api/creative/generate-image)는 인증·검증·저장만 한다.
// Higgsfield 는 결과 URL(자체 CDN)을 그대로 쓰고, Gemini·OpenAI 는 base64 로 오므로 route 가 storage 에 올린다.

export class ImageGenError extends Error {}

export type GeneratedImage = { url: string } | { data: Buffer; mimeType: string };

export function methodReady(id: ImageMethodId): boolean {
  const key = IMAGE_METHOD_BY_ID[id]?.envKey;
  return key ? Boolean(process.env[key]) : true;
}

// ---------------------------------------------------------------- Google Gemini (Nano Banana 2)
// source 가 있으면 편집(원본 + 지시문), 없으면 생성. aspectRatio 가 빈 값이면 원본 비율을 따른다.
async function gemini(prompt: string, aspectRatio: string, source?: { data: Buffer; mimeType: string }): Promise<GeneratedImage> {
  const model = IMAGE_METHOD_BY_ID.gemini.model;
  const parts: Record<string, unknown>[] = source ? [{ inlineData: { mimeType: source.mimeType, data: source.data.toString("base64") } }] : [];
  parts.push({ text: prompt });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"], ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}) },
    }),
  });
  const json = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    error?: { code?: number; message?: string; status?: string };
  } | null;
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 429 && /billing|prepay|credit/i.test(msg)) throw new ImageGenError("Gemini API 크레딧이 소진됐어요. ai.studio에서 결제를 충전한 뒤 다시 시도해 주세요.");
    if (res.status === 401 || res.status === 403) throw new ImageGenError(`GEMINI_API_KEY 인증에 실패했어요 (${res.status}). 키와 모델 접근 권한을 확인해 주세요.`);
    throw new ImageGenError(`Gemini 이미지 생성 실패: ${msg.slice(0, 200)}`);
  }
  if (json?.promptFeedback?.blockReason) throw new ImageGenError("프롬프트가 안전 정책에 걸렸어요. 표현을 바꿔 다시 시도해 주세요.");
  const part = json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData) {
    const reason = json?.candidates?.[0]?.finishReason;
    throw new ImageGenError(`Gemini가 이미지를 돌려주지 않았어요${reason ? ` (${reason})` : ""}. 프롬프트를 조금 바꿔 다시 시도해 주세요.`);
  }
  return { data: Buffer.from(part.inlineData.data, "base64"), mimeType: part.inlineData.mimeType || "image/png" };
}

// ---------------------------------------------------------------- OpenAI (GPT Image 2)
const OPENAI_SIZE: Record<string, string> = {
  "1:1": "1024x1024",
  "4:5": "1024x1280",
  "9:16": "1024x1536", // 2:3 — 표준 세로 크기
  "16:9": "1536x1024", // 3:2 — 표준 가로 크기
};

async function openai(prompt: string, aspectRatio: string, source?: { data: Buffer; mimeType: string }): Promise<GeneratedImage> {
  const model = IMAGE_METHOD_BY_ID.openai.model;
  let res: Response;
  if (source) {
    // 편집: multipart (image + prompt). 비율 미지정이면 size=auto 로 원본에 맞춘다
    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("n", "1");
    form.append("size", OPENAI_SIZE[aspectRatio] ?? "auto");
    const ext = source.mimeType.includes("png") ? "png" : source.mimeType.includes("webp") ? "webp" : "jpg";
    form.append("image", new Blob([new Uint8Array(source.data)], { type: source.mimeType }), `source.${ext}`);
    res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
  } else {
    res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, prompt, n: 1, size: OPENAI_SIZE[aspectRatio] ?? "1024x1024" }),
    });
  }
  const json = (await res.json().catch(() => null)) as {
    data?: { b64_json?: string; url?: string }[];
    error?: { message?: string; code?: string };
  } | null;
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    if (json?.error?.code === "insufficient_quota") throw new ImageGenError("OpenAI API 크레딧이 부족해요. platform.openai.com에서 충전한 뒤 다시 시도해 주세요.");
    if (res.status === 401) throw new ImageGenError("OPENAI_API_KEY가 유효하지 않아요. 서버 환경변수를 확인해 주세요.");
    if (res.status === 403) throw new ImageGenError(`OpenAI 조직에 ${IMAGE_METHOD_BY_ID.openai.model} 접근 권한이 없어요 (조직 인증이 필요할 수 있어요).`);
    if (json?.error?.code === "moderation_blocked") throw new ImageGenError("프롬프트가 OpenAI 안전 정책에 걸렸어요. 표현을 바꿔 다시 시도해 주세요.");
    throw new ImageGenError(`OpenAI 이미지 생성 실패: ${msg.slice(0, 200)}`);
  }
  const item = json?.data?.[0];
  if (item?.b64_json) return { data: Buffer.from(item.b64_json, "base64"), mimeType: "image/png" };
  if (item?.url) return { url: item.url };
  throw new ImageGenError("OpenAI 응답에서 이미지를 찾지 못했어요.");
}

export async function generateWith(method: ImageMethodId, prompt: string, aspectRatio: string): Promise<GeneratedImage> {
  const m = IMAGE_METHOD_BY_ID[method];
  if (!m || m.mode !== "api") throw new ImageGenError("API로 생성할 수 없는 방법이에요.");
  if (!methodReady(method)) throw new ImageGenError(`서버에 ${m.envKey}가 없어요. .env.local(배포 환경은 Vercel 환경변수)에 추가해 주세요.`);
  const ratio = m.ratios.includes(aspectRatio) ? aspectRatio : m.ratios[0];
  if (method === "higgsfield") return { url: (await higgsfieldImage({ prompt, aspectRatio: ratio })).url };
  if (method === "gemini") return gemini(prompt, ratio);
  return openai(prompt, ratio);
}

// 이미지 편집 — 원본 + 지시문 → 수정 이미지. aspectRatio 가 "원본"/빈 값이면 원본 비율 유지.
export async function editWith(
  method: "gemini" | "openai",
  source: { data: Buffer; mimeType: string },
  prompt: string,
  aspectRatio: string,
): Promise<GeneratedImage> {
  const m = IMAGE_METHOD_BY_ID[method];
  if (!methodReady(method)) throw new ImageGenError(`서버에 ${m.envKey}가 없어요. .env.local(배포 환경은 Vercel 환경변수)에 추가해 주세요.`);
  const ratio = m.ratios.includes(aspectRatio) ? aspectRatio : "";
  return method === "gemini" ? gemini(prompt, ratio, source) : openai(prompt, ratio, source);
}

// 우리 저장소·Higgsfield 등에 있는 원본 이미지를 서버에서 받는다 (편집 API·Claude 비전 입력용)
export async function fetchSourceImage(url: string): Promise<{ data: Buffer; mimeType: string }> {
  const res = await fetch(url, { headers: { Accept: "image/png,image/jpeg,image/webp,image/*" } });
  if (!res.ok) throw new ImageGenError(`원본 이미지를 받지 못했어요 (HTTP ${res.status}). URL이 만료됐을 수 있어요.`);
  const mimeType = (res.headers.get("content-type") || "image/png").split(";")[0].trim();
  if (!/^image\/(png|jpeg|webp|gif)$/.test(mimeType)) throw new ImageGenError(`지원하지 않는 이미지 형식이에요 (${mimeType}).`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length > 20 * 1048576) throw new ImageGenError("원본 이미지가 20MB를 넘어요.");
  return { data, mimeType };
}
