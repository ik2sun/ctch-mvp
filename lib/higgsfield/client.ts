// Higgsfield API 클라이언트 — https://docs.higgsfield.ai
// 인증: Authorization: Key {HIGGSFIELD_API_KEY}[:{HIGGSFIELD_SECRET}]
// 제출(POST) → 큐잉 응답(status_url) → 폴링(GET status_url)으로 완료를 기다리는 비동기 패턴.

const BASE_URL = "https://platform.higgsfield.ai";

export const IMAGE_MODEL_DEFAULT = "higgsfield-ai/soul/standard";
export const VIDEO_MODEL_DEFAULT = "higgsfield-ai/dop/standard";

export class HiggsfieldError extends Error {}

function authHeader(): string {
  const key = process.env.HIGGSFIELD_API_KEY;
  if (!key) {
    throw new HiggsfieldError(
      "서버에 HIGGSFIELD_API_KEY가 설정되지 않았어요. .env.local을 확인해 주세요.",
    );
  }
  const secret = process.env.HIGGSFIELD_SECRET;
  return secret ? `Key ${key}:${secret}` : `Key ${key}`;
}

type SubmitResponse = {
  status: string;
  request_id: string;
  status_url: string;
  cancel_url: string;
};

type StatusResponse = SubmitResponse & {
  images?: { url: string }[];
  video?: { url: string };
  error?: string;
};

// 응답 바디를 JSON으로 먼저 시도하고, 실패하면 원문 텍스트를 그대로 돌려준다.
// (에러 응답이 JSON이 아니거나 {error}/{message} 필드명이 문서와 다를 수 있어 원문을 남겨야 진단 가능)
async function readBody(res: Response): Promise<{ json: Record<string, unknown> | null; text: string }> {
  const text = await res.text().catch(() => "");
  try {
    return { json: text ? JSON.parse(text) : null, text };
  } catch {
    return { json: null, text };
  }
}

function extractDetail(json: Record<string, unknown> | null, text: string): string {
  const fromJson =
    (json?.error as string) ??
    (json?.message as string) ??
    (json?.detail as string) ??
    (typeof json?.errors === "string" ? json.errors : undefined);
  if (fromJson) return fromJson;
  if (text.trim()) return text.trim().slice(0, 300);
  return "";
}

// Higgsfield가 error 필드에 코드성 문자열을 내려주는 경우, 사람이 바로 이해할 수 있는 한국어 안내로 바꿔준다.
const KNOWN_ERROR_HINTS: Record<string, string> = {
  not_enough_credits:
    "Higgsfield 계정에 크레딧이 부족해요. platform.higgsfield.ai에서 크레딧을 충전한 뒤 다시 시도해 주세요.",
  insufficient_credits:
    "Higgsfield 계정에 크레딧이 부족해요. platform.higgsfield.ai에서 크레딧을 충전한 뒤 다시 시도해 주세요.",
  model_access_denied: "이 모델에 대한 접근 권한이 없어요. platform.higgsfield.ai에서 플랜/모델 권한을 확인해 주세요.",
  invalid_api_key: "API 키가 올바르지 않아요. HIGGSFIELD_API_KEY 값을 다시 확인해 주세요.",
};

function friendlyMessage(detail: string, status: number): string {
  const known = KNOWN_ERROR_HINTS[detail.trim()];
  if (known) return known;
  const hint =
    status === 403
      ? " (API 키/시크릿이 올바른지, platform.higgsfield.ai 계정에 크레딧·이 모델 접근 권한이 있는지 확인해 주세요.)"
      : status === 401
        ? " (API 키 인증에 실패했어요. HIGGSFIELD_API_KEY/HIGGSFIELD_SECRET 값을 다시 확인해 주세요.)"
        : "";
  return `Higgsfield 요청이 거부됐어요 (HTTP ${status})${detail ? `: ${detail}` : ""}${hint}`;
}

async function submit(modelPath: string, body: Record<string, unknown>): Promise<SubmitResponse> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${modelPath}`, {
      method: "POST",
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new HiggsfieldError("Higgsfield 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  const { json, text } = await readBody(res);
  if (!res.ok) {
    console.error(`[higgsfield] POST /${modelPath} -> HTTP ${res.status}`, text || "(빈 응답 본문)");
    throw new HiggsfieldError(friendlyMessage(extractDetail(json, text), res.status));
  }
  if (!json?.status_url || !json?.request_id) {
    throw new HiggsfieldError("Higgsfield 응답 형식이 예상과 달라요. API 문서가 변경됐을 수 있어요.");
  }
  return json as unknown as SubmitResponse;
}

async function pollStatus(
  statusUrl: string,
  { intervalMs = 2500, timeoutMs = 120000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<StatusResponse> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(statusUrl, {
      headers: { Authorization: authHeader(), Accept: "application/json" },
    });
    const { json, text } = await readBody(res);
    if (!res.ok || !json) {
      console.error(`[higgsfield] GET ${statusUrl} -> HTTP ${res.status}`, text || "(빈 응답 본문)");
      throw new HiggsfieldError(friendlyMessage(extractDetail(json, text), res.status));
    }
    const status = json.status as string;
    if (status === "completed") return json as unknown as StatusResponse;
    if (status === "failed" || status === "error") {
      const detail = (json.error as string) ?? "";
      throw new HiggsfieldError(
        KNOWN_ERROR_HINTS[detail.trim()] ?? (detail || "Higgsfield 생성이 실패했어요."),
      );
    }
    if (status === "nsfw") {
      throw new HiggsfieldError("생성 결과가 안전 필터에 걸렸어요. 프롬프트를 조금 바꿔서 다시 시도해 주세요.");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new HiggsfieldError(
    "Higgsfield 생성이 제한 시간 내에 끝나지 않았어요. 잠시 후 다시 시도해 주세요.",
  );
}

export async function generateImage(params: {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  model?: string;
}): Promise<{ url: string; requestId: string }> {
  const submitted = await submit(params.model || IMAGE_MODEL_DEFAULT, {
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio ?? "1:1",
    resolution: params.resolution ?? "720p",
  });
  const result = await pollStatus(submitted.status_url, { timeoutMs: 120000 });
  const url = result.images?.[0]?.url;
  if (!url) throw new HiggsfieldError("Higgsfield 응답에서 이미지 URL을 찾지 못했어요.");
  return { url, requestId: submitted.request_id };
}

export async function generateVideo(params: {
  imageUrl: string;
  prompt: string;
  durationSeconds?: number;
  model?: string;
}): Promise<{ url: string; requestId: string }> {
  const submitted = await submit(params.model || VIDEO_MODEL_DEFAULT, {
    image_url: params.imageUrl,
    prompt: params.prompt,
    duration: params.durationSeconds ?? 5,
  });
  const result = await pollStatus(submitted.status_url, { intervalMs: 4000, timeoutMs: 300000 });
  const url = result.video?.url;
  if (!url) throw new HiggsfieldError("Higgsfield 응답에서 영상 URL을 찾지 못했어요.");
  return { url, requestId: submitted.request_id };
}
