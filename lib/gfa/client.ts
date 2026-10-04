// GFA Open API 호출 공통부 — https://openapi.naver.com/v1/ad-api/1.0 (v1은 고정, 1.0이 API 버전)
// 헤더: Authorization: Bearer {네이버 로그인 액세스 토큰}, AccessManagerAccountNo: {관리 계정 번호}(관리 계정 멤버로만 권한이 있을 때 필수)
// 요청 제한 수치는 문서에 없다 → 429면 2초 쉬고 1회 재시도.

import { NextResponse } from "next/server";
import { GfaAuthError } from "./auth";

const BASE_URL = "https://openapi.naver.com/v1/ad-api/1.0";

export class GfaApiError extends Error {
  code?: "RATE_LIMITED" | "UNAUTHORIZED" | "FORBIDDEN";
  status?: number;
  constructor(message: string, code?: GfaApiError["code"], status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Query = Record<string, string | number | boolean | undefined>;
export type GfaRequestOptions = {
  accessToken: string;
  managerAccountNo?: string | null;
  query?: Query;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  json?: unknown;     // JSON 본문(쓰기 — 캠페인 오토파일럿)
  form?: FormData;    // multipart 본문(소재 이미지 업로드)
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function performRequest<T>(path: string, opts: GfaRequestOptions): Promise<T> {
  const url = new URL(BASE_URL + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = { Authorization: `Bearer ${opts.accessToken}`, Accept: "application/json" };
  if (opts.managerAccountNo) headers.AccessManagerAccountNo = opts.managerAccountNo;
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) body = opts.form; // Content-Type(boundary)은 fetch가 붙인다

  const res = await fetch(url.toString(), { method: opts.method ?? (body ? "POST" : "GET"), headers, body, cache: "no-store" });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new GfaApiError(`GFA API 응답을 해석하지 못했어요. (${res.status})`, undefined, res.status);
    }
  }
  if (!res.ok) {
    // 게이트웨이 오류 {errorCode, errorMessage} / 광고 API 오류 {error: {code, message, description}}
    const err = json as { errorCode?: string; errorMessage?: string; error?: { code?: string; message?: string; description?: string } } | null;
    const detail = [err?.error?.message, err?.error?.description].filter(Boolean).join(" — ") || err?.errorMessage || `GFA API 요청이 실패했어요. (${res.status})`;
    if (res.status === 401 || err?.errorCode === "024") {
      throw new GfaApiError(`GFA 인증에 실패했어요. API 사용 승인 전에 연결했다면 네이버 내정보 > 연결된 서비스에서 동의 철회 후 다시 연결하세요. (${detail})`, "UNAUTHORIZED", 401);
    }
    if (res.status === 403) throw new GfaApiError(`이 광고계정에 접근 권한이 없어요. 관리 계정 번호와 광고계정 소속을 확인하세요. (${detail})`, "FORBIDDEN", 403);
    if (res.status === 429) throw new GfaApiError("GFA 요청 제한에 걸렸어요. 잠시 후 다시 시도해 주세요.", "RATE_LIMITED", 429);
    throw new GfaApiError(detail, undefined, res.status);
  }
  return json as T;
}

async function withRetry<T>(path: string, opts: GfaRequestOptions): Promise<T> {
  try {
    return await performRequest<T>(path, opts);
  } catch (e) {
    // 쓰기 요청은 5xx면 이미 처리됐을 수 있어(중복 생성) 재시도하지 않는다. 429는 처리 전이라 재시도
    const write = (opts.method && opts.method !== "GET") || opts.json !== undefined || !!opts.form;
    if (!(e instanceof GfaApiError) || (e.code !== "RATE_LIMITED" && (write || !(e.status && e.status >= 500)))) throw e;
    await sleep(2000);
    return await performRequest<T>(path, opts);
  }
}

// 광고계정별 관리 계정 헤더 사용 여부 — 연결한 아이디가 직접 멤버인 계정에 관리 계정 헤더를 붙이면 403(2026-09-30 확인, 8790),
// 관리 계정 하위 계정은 헤더가 있어야 한다. 403이면 반대로 한 번 더 부르고 성공한 방식을 기억한다.
const headerMode = new Map<string, boolean>();

export async function gfaRequest<T>(path: string, opts: GfaRequestOptions): Promise<T> {
  const account = path.match(/^\/adAccounts\/(\d+)/)?.[1];
  if (!account || !opts.managerAccountNo) return withRetry<T>(path, opts);

  const first = headerMode.get(account) ?? true;
  const call = (useHeader: boolean) => withRetry<T>(path, { ...opts, managerAccountNo: useHeader ? opts.managerAccountNo : null });
  try {
    const res = await call(first);
    headerMode.set(account, first);
    return res;
  } catch (e) {
    if (!(e instanceof GfaApiError) || e.code !== "FORBIDDEN") throw e;
    const res = await call(!first);
    headerMode.set(account, !first);
    return res;
  }
}

// gfa API 라우트 공통 에러 응답 — 프런트가 재연결/재시도 UX를 판단할 수 있게 code를 함께 준다
export function gfaErrorResponse(e: unknown, fallbackMessage: string) {
  const message = e instanceof Error ? e.message : fallbackMessage;
  if (e instanceof GfaAuthError) return NextResponse.json({ error: message, code: e.code }, { status: e.code === "NOT_CONFIGURED" ? 500 : 409 });
  if (e instanceof GfaApiError) {
    const status = e.code === "RATE_LIMITED" ? 429 : e.code === "UNAUTHORIZED" ? 409 : e.code === "FORBIDDEN" ? 403 : 502;
    return NextResponse.json({ error: message, code: e.code }, { status });
  }
  return NextResponse.json({ error: message }, { status: 400 });
}
