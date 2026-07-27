import { NextResponse } from "next/server";
import { buildNaverAdHeaders, type NaverAdCredentials } from "./auth";

// 공식 기본 URL(https://api.searchad.naver.com) — 구 문서상의 api.naver.com은 더 이상 쓰이지 않음
const BASE_URL = "https://api.searchad.naver.com";

export class NaverAdApiError extends Error {
  code?: "RATE_LIMITED";
  constructor(message: string, code?: "RATE_LIMITED") {
    super(message);
    this.code = code;
  }
}

type Query = Record<string, string | number | undefined>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 네이버 검색광고 API는 짧은 시간에 요청이 몰리면 429(Too Many Requests)를 반환한다.
// 이 프로세스에서 나가는 모든 요청을 하나의 대기열로 묶어 최소 간격을 두고 순차 발송한다.
const MIN_REQUEST_INTERVAL_MS = 1000;
let queue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function scheduleSlot(): Promise<void> {
  const slot = queue.then(async () => {
    const wait = lastRequestAt + MIN_REQUEST_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  });
  // 이번 슬롯이 실패해도 대기열 자체는 끊기지 않게 한다.
  queue = slot.catch(() => undefined);
  return slot;
}

async function performRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  credentials: NaverAdCredentials,
  query?: Query,
): Promise<T> {
  await scheduleSlot();

  const url = new URL(BASE_URL + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: buildNaverAdHeaders(method, path, credentials),
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new NaverAdApiError("네이버 검색광고 API 응답을 해석하지 못했어요.");
    }
  }

  if (!res.ok) {
    const body = json as { type?: string; title?: string; message?: string; detail?: string } | null;
    const isRateLimited = res.status === 429 || body?.type === "urn:naver:api:problem:toomanyrequest";
    if (isRateLimited) {
      throw new NaverAdApiError("잠시 후 다시 시도해주세요.", "RATE_LIMITED");
    }
    const detail =
      body?.title ?? body?.message ?? body?.detail ?? `네이버 검색광고 API 요청이 실패했어요. (${res.status})`;
    throw new NaverAdApiError(detail);
  }

  return json as T;
}

// 실패 시(429 포함) 3초 후 1회만 재시도한다.
export async function naverAdRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  credentials: NaverAdCredentials,
  query?: Query,
): Promise<T> {
  try {
    return await performRequest<T>(method, path, credentials, query);
  } catch {
    await sleep(3000);
    return await performRequest<T>(method, path, credentials, query);
  }
}

// naver-ad API 라우트들의 공통 에러 응답 — RATE_LIMITED는 프런트가 "잠시 후 재시도" UX를
// 판단할 수 있도록 code를 함께 내려준다.
export function naverErrorResponse(e: unknown, fallbackMessage: string) {
  const message = e instanceof Error ? e.message : fallbackMessage;
  const isRateLimited = e instanceof NaverAdApiError && e.code === "RATE_LIMITED";
  const status = isRateLimited ? 429 : e instanceof NaverAdApiError ? 502 : 400;
  return NextResponse.json({ error: message, code: isRateLimited ? "RATE_LIMITED" : undefined }, { status });
}

// URL 길이 제한을 피하기 위해 대량 id 목록을 나눠 요청
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
