// 구글 Ads API 호출 — REST v25 googleAds:searchStream(GAQL). 서버 전용.
// Explorer 등급은 실계정 하루 2,880건(searchStream 1회 = 1건) → 요약·리포트 라우트의 서버 캐시와 함께 쓴다.
// login-customer-id(MCC)는 MCC 하위 계정 조회에 필요하지만, 연결 계정이 직접 접근 권한을 가진 계정에 붙이면
// USER_PERMISSION_DENIED가 날 수 있어 계정별로 헤더 유무를 바꿔 한 번 더 시도하고 기억한다(GFA와 같은 방식).
import { NextResponse } from "next/server";
import { GoogleAdsAuthError, type GoogleAdsCredentials } from "./auth";

export const GADS_API_VERSION = "v25";
const BASE = `https://googleads.googleapis.com/${GADS_API_VERSION}`;

export class GoogleAdsApiError extends Error {
  code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_APPROVED" | "API_DISABLED" | "RATE_LIMITED" | "BAD_QUERY" | "OTHER";
  constructor(code: GoogleAdsApiError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

type ApiErrorBody = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: { errors?: { errorCode?: Record<string, string>; message?: string }[] }[];
  };
};

function toError(status: number, body: ApiErrorBody | ApiErrorBody[] | null, customerId: string): GoogleAdsApiError {
  const err = (Array.isArray(body) ? body[0] : body)?.error;
  const first = err?.details?.flatMap((d) => d.errors ?? [])[0];
  const kind = first?.errorCode ? Object.values(first.errorCode)[0] : "";
  const msg = first?.message || err?.message || `HTTP ${status}`;
  const raw = JSON.stringify(body ?? "");
  if (/NOT_APPROVED/.test(raw)) {
    return new GoogleAdsApiError("NOT_APPROVED", `이 GCP 프로젝트는 실계정 조회 승인이 안 됐어요. Cloud Console > Google Ads API에서 등급(Explorer 이상)을 확인하세요. (${kind || msg})`);
  }
  if (/SERVICE_DISABLED|has not been used in project|is disabled/.test(raw)) {
    return new GoogleAdsApiError("API_DISABLED", "GCP 프로젝트에서 Google Ads API가 사용 설정되지 않았어요.");
  }
  if (status === 401 || err?.status === "UNAUTHENTICATED") return new GoogleAdsApiError("UNAUTHORIZED", `구글 인증이 만료됐어요. 다시 연결하세요. (${msg})`);
  if (status === 429 || err?.status === "RESOURCE_EXHAUSTED" || /quotaError|RESOURCE_EXHAUSTED/.test(raw)) {
    return new GoogleAdsApiError("RATE_LIMITED", "구글 Ads API 호출 한도에 걸렸어요. 잠시 후 다시 시도하세요. (Explorer 등급 하루 2,880건)");
  }
  if (status === 403 || err?.status === "PERMISSION_DENIED") {
    return new GoogleAdsApiError("FORBIDDEN", `Customer ID ${customerId}에 접근 권한이 없어요 — 연결한 구글 계정이 이 계정이나 상위 MCC의 사용자인지 확인하세요. (${kind || msg})`);
  }
  if (status === 400) return new GoogleAdsApiError("BAD_QUERY", `구글 Ads 조회 오류 — ${kind ? `${kind}: ` : ""}${msg}`);
  return new GoogleAdsApiError("OTHER", `구글 Ads API 오류 — ${msg}`);
}

const headerChoice = new Map<string, boolean>(); // customerId → login-customer-id 헤더를 붙일지

// suffix: "/googleAds:searchStream"(리소스 경로) 또는 ":generateKeywordIdeas"(고객 단위 RPC)
async function post(creds: GoogleAdsCredentials, customerId: string, suffix: string, body: unknown, withLogin: boolean) {
  const headers: Record<string, string> = { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" };
  if (withLogin && creds.loginCustomerId) headers["login-customer-id"] = creds.loginCustomerId;
  const res = await fetch(`${BASE}/customers/${customerId}${suffix}`, { method: "POST", headers, body: JSON.stringify(body), cache: "no-store" });
  const json = await res.json().catch(() => null);
  return { res, json };
}

// 공통 호출 — 429·5xx는 2초 뒤 1회 재시도, USER_PERMISSION_DENIED면 login-customer-id 헤더 유무를 바꿔 1회 재시도하고 기억.
export async function gadsCall<T = unknown>(creds: GoogleAdsCredentials, suffix: string, body: unknown, customerId = creds.customerId): Promise<T> {
  if (!customerId) throw new GoogleAdsAuthError("NO_CUSTOMER", "Customer ID가 없어요.");
  const defaultLogin = !!creds.loginCustomerId && creds.loginCustomerId !== customerId;
  let withLogin = headerChoice.get(customerId) ?? defaultLogin;
  let { res, json } = await post(creds, customerId, suffix, body, withLogin);

  if (!res.ok && (res.status === 429 || res.status >= 500)) {
    await new Promise((r) => setTimeout(r, 2000));
    ({ res, json } = await post(creds, customerId, suffix, body, withLogin));
  }
  if (!res.ok && res.status === 403 && creds.loginCustomerId && /USER_PERMISSION_DENIED/.test(JSON.stringify(json))) {
    withLogin = !withLogin;
    ({ res, json } = await post(creds, customerId, suffix, body, withLogin));
  }
  if (!res.ok) throw toError(res.status, json, customerId);
  headerChoice.set(customerId, withLogin);
  return json as T;
}

// GAQL 실행 → 결과 행 전체(searchStream은 청크 배열로 온다)
export async function gadsSearch<T = Record<string, unknown>>(creds: GoogleAdsCredentials, query: string, customerId = creds.customerId): Promise<T[]> {
  const json = await gadsCall<unknown>(creds, "/googleAds:searchStream", { query }, customerId);
  const chunks = (Array.isArray(json) ? json : [json]) as { results?: T[] }[];
  return chunks.flatMap((c) => c?.results ?? []);
}

// 연결 계정이 직접 접근 가능한 계정 목록(MCC 하위는 포함 안 됨 — customer_client로 따로)
export async function listAccessibleCustomers(accessToken: string): Promise<string[]> {
  const res = await fetch(`${BASE}/customers:listAccessibleCustomers`, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw toError(res.status, json, "-");
  return ((json?.resourceNames ?? []) as string[]).map((r) => r.replace("customers/", ""));
}

export function googleAdsErrorResponse(e: unknown, fallbackMessage: string) {
  const message = e instanceof Error ? e.message : fallbackMessage;
  if (e instanceof GoogleAdsAuthError) return NextResponse.json({ error: message, code: e.code }, { status: e.code === "NOT_CONFIGURED" ? 500 : 409 });
  if (e instanceof GoogleAdsApiError) {
    const status = e.code === "RATE_LIMITED" ? 429 : e.code === "UNAUTHORIZED" ? 409 : e.code === "FORBIDDEN" || e.code === "NOT_APPROVED" ? 403 : 502;
    return NextResponse.json({ error: message, code: e.code }, { status });
  }
  return NextResponse.json({ error: message }, { status: 400 });
}
