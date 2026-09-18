// 카카오모먼트 Open API 호출 공통부 — https://apis.moment.kakao.com/openapi/v4
// 헤더: Authorization: Bearer {비즈니스 액세스 토큰}, adAccountId: {광고계정 번호}
// 요청 제한: 광고계정·캠페인·소재 보고서는 광고계정당 5초에 1회, 광고그룹 보고서는 1초에 1회.
// 제한 시간 안에 다시 부르면 거절되므로, 같은 광고계정·같은 보고서 종류 요청을 대기열로 묶어 간격을 둔다.

import { NextResponse } from "next/server";
import { KakaoAuthError } from "./auth";

const BASE_URL = "https://apis.moment.kakao.com/openapi/v4";

export class KakaoMomentApiError extends Error {
  code?: "RATE_LIMITED" | "UNAUTHORIZED" | "FORBIDDEN";
  status?: number;
  constructor(message: string, code?: KakaoMomentApiError["code"], status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type RateBucket = "account-report" | "campaign-report" | "adgroup-report" | "creative-report" | "list";
const BUCKET_INTERVAL_MS: Record<RateBucket, number> = {
  "account-report": 5200,
  "campaign-report": 5200,
  "adgroup-report": 1200,
  "creative-report": 5200,
  list: 250,
};

type Query = Record<string, string | number | Array<string | number> | undefined>;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// 광고계정 × 버킷별 직렬 대기열
const queues = new Map<string, { tail: Promise<void>; lastAt: number }>();

function scheduleSlot(key: string, intervalMs: number): Promise<void> {
  const q = queues.get(key) ?? { tail: Promise.resolve(), lastAt: 0 };
  const slot = q.tail.then(async () => {
    const wait = q.lastAt + intervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    q.lastAt = Date.now();
  });
  q.tail = slot.catch(() => undefined);
  queues.set(key, q);
  return slot;
}

export type KakaoRequestOptions = {
  accessToken: string;
  adAccountId?: string; // 광고계정 목록 조회처럼 계정 헤더가 필요 없는 호출은 생략
  query?: Query;
  bucket?: RateBucket;
};

async function performRequest<T>(path: string, opts: KakaoRequestOptions): Promise<T> {
  const bucket = opts.bucket ?? "list";
  await scheduleSlot(`${opts.adAccountId ?? "app"}:${bucket}`, BUCKET_INTERVAL_MS[bucket]);

  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined) continue;
    url.searchParams.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.accessToken}`,
    Accept: "application/json",
  };
  if (opts.adAccountId) headers.adAccountId = opts.adAccountId;

  const res = await fetch(url.toString(), { method: "GET", headers, cache: "no-store" });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new KakaoMomentApiError("카카오모먼트 API 응답을 해석하지 못했어요.", undefined, res.status);
    }
  }

  if (!res.ok) {
    const body = json as { code?: number | string; msg?: string; message?: string; extras?: unknown } | null;
    const detail = body?.msg ?? body?.message ?? `카카오모먼트 API 요청이 실패했어요. (${res.status})`;
    if (res.status === 401) throw new KakaoMomentApiError("카카오 토큰이 유효하지 않아요. 광고주 관리에서 카카오 계정을 다시 연결해 주세요.", "UNAUTHORIZED", 401);
    if (res.status === 403) throw new KakaoMomentApiError(`카카오모먼트 권한이 없어요. 앱의 카카오모먼트 API 사용 권한과 광고계정 멤버 권한을 확인해 주세요. (${detail})`, "FORBIDDEN", 403);
    if (res.status === 429 || /too many|limit/i.test(detail)) throw new KakaoMomentApiError("카카오모먼트 요청 제한에 걸렸어요. 잠시 후 다시 시도해 주세요.", "RATE_LIMITED", 429);
    throw new KakaoMomentApiError(detail, undefined, res.status);
  }
  return json as T;
}

// 요청 제한(429)이나 일시 오류면 버킷 간격만큼 기다렸다 1회 재시도
export async function kakaoRequest<T>(path: string, opts: KakaoRequestOptions): Promise<T> {
  try {
    return await performRequest<T>(path, opts);
  } catch (e) {
    if (e instanceof KakaoMomentApiError && (e.code === "UNAUTHORIZED" || e.code === "FORBIDDEN")) throw e;
    await sleep(BUCKET_INTERVAL_MS[opts.bucket ?? "list"]);
    return await performRequest<T>(path, opts);
  }
}

// kakao-moment API 라우트 공통 에러 응답 — 프런트가 재연결/재시도 UX를 판단할 수 있게 code를 함께 준다
export function kakaoErrorResponse(e: unknown, fallbackMessage: string) {
  const message = e instanceof Error ? e.message : fallbackMessage;
  if (e instanceof KakaoAuthError) {
    const status = e.code === "NOT_CONFIGURED" ? 500 : 409;
    return NextResponse.json({ error: message, code: e.code }, { status });
  }
  if (e instanceof KakaoMomentApiError) {
    const status = e.code === "RATE_LIMITED" ? 429 : e.code === "UNAUTHORIZED" ? 409 : e.code === "FORBIDDEN" ? 403 : 502;
    return NextResponse.json({ error: message, code: e.code }, { status });
  }
  return NextResponse.json({ error: message }, { status: 400 });
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
