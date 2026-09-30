// 카카오모먼트 인증 — 카카오 "비즈니스 인증"(/oauth/business/*)으로 발급한 비즈니스 토큰 기반.
// 일반 카카오 로그인 토큰으로 호출하면 모먼트 API가 401 "target biz token is not supplied."를 준다(2026-09-28 확인).
// 앱 단위 설정(REST API 키·비즈니스 인증 시크릿·리다이렉트 URI)은 .env.local, 광고주 단위 토큰은 clients 행에 저장한다.
// 비즈니스 토큰은 리프레시 토큰이 없고 장기 미사용 시 만료된다 → 401이면 광고주 관리에서 다시 연결.
// 카카오디벨로퍼스 REST API 키 설정의 "비즈니스 인증 리다이렉트 URI"에 콜백 주소를 등록해야 한다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getShared } from "@/lib/sharedKeys";

const KAUTH_AUTHORIZE = "https://kauth.kakao.com/oauth/business/authorize";
const KAUTH_TOKEN = "https://kauth.kakao.com/oauth/business/token";
// 비즈니스 동의항목 — 광고계정 운영 권한(조회 포함). 읽기 전용 항목은 따로 없다.
const DEFAULT_SCOPE = "moment_management";

// OAuth state 를 담는 쿠키 이름 — start 라우트가 굽고 callback 라우트가 읽는다.
// (라우트 파일은 핸들러 외 export 가 금지되어 여기에 둔다)
export const STATE_COOKIE = "ctch_kakao_oauth";

export type KakaoTokenRow = {
  kakao_ad_account_id?: string | null;
  kakao_access_token?: string | null;
  kakao_token_expires_at?: string | null;
  kakao_refresh_token?: string | null;
  kakao_refresh_expires_at?: string | null;
  kakao_linked_at?: string | null;
} | null | undefined;

export type KakaoTokens = {
  accessToken: string;
  expiresAt: string; // ISO
  refreshToken?: string; // 갱신 응답에서는 리프레시 토큰 만료 1개월 미만일 때만 새 값이 온다
  refreshExpiresAt?: string;
  scope?: string;
};

export class KakaoAuthError extends Error {
  code: "NOT_CONFIGURED" | "NOT_LINKED" | "NO_AD_ACCOUNT" | "REFRESH_EXPIRED" | "TOKEN_ERROR";
  constructor(code: KakaoAuthError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export function kakaoAppConfig(): { restApiKey: string; clientSecret?: string; redirectUri: string; scope: string } {
  const restApiKey = process.env.KAKAO_REST_API_KEY?.trim();
  if (!restApiKey) {
    throw new KakaoAuthError("NOT_CONFIGURED", "서버에 KAKAO_REST_API_KEY가 없어요. 카카오디벨로퍼스 앱의 REST API 키를 .env.local에 넣어 주세요.");
  }
  const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3001").replace(/\/$/, "");
  return {
    restApiKey,
    // 카카오 로그인 시크릿과 비즈니스 인증 시크릿은 별개 — 비즈니스 인증 쪽을 써야 한다
    clientSecret: process.env.KAKAO_BUSINESS_CLIENT_SECRET?.trim() || process.env.KAKAO_CLIENT_SECRET?.trim() || undefined,
    redirectUri: process.env.KAKAO_REDIRECT_URI?.trim() || `${site}/api/kakao-moment/oauth/callback`,
    scope: process.env.KAKAO_OAUTH_SCOPE?.trim() || DEFAULT_SCOPE,
  };
}

// 인가 코드 요청 URL — state에 광고주 식별·CSRF 방지 값을 담는다
export function buildAuthorizeUrl(state: string): string {
  const cfg = kakaoAppConfig();
  const url = new URL(KAUTH_AUTHORIZE);
  url.searchParams.set("client_id", cfg.restApiKey);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", cfg.scope);
  return url.toString();
}

type KauthResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
  error_code?: string;
};

async function kauthToken(params: Record<string, string>): Promise<KakaoTokens> {
  const cfg = kakaoAppConfig();
  const body = new URLSearchParams({ client_id: cfg.restApiKey, ...params });
  if (cfg.clientSecret) body.set("client_secret", cfg.clientSecret);
  const res = await fetch(KAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as KauthResponse;
  if (!res.ok || !json.access_token) {
    const desc = json.error_description ?? json.error ?? `HTTP ${res.status}`;
    if (json.error_code === "KOE010" || json.error === "invalid_client")
      throw new KakaoAuthError("TOKEN_ERROR", "카카오 비즈니스 인증 시크릿이 맞지 않아요. .env.local의 KAKAO_BUSINESS_CLIENT_SECRET을 확인해 주세요. (Bad client credentials)");
    throw new KakaoAuthError("TOKEN_ERROR", `카카오 비즈니스 토큰 발급에 실패했어요. (${desc})`);
  }
  const now = Date.now();
  return {
    accessToken: json.access_token,
    // 비즈니스 토큰은 만료 시각을 주지 않는다(장기 미사용 시 만료)
    expiresAt: json.expires_in ? new Date(now + json.expires_in * 1000).toISOString() : "",
    refreshToken: json.refresh_token,
    refreshExpiresAt: json.refresh_token_expires_in ? new Date(now + json.refresh_token_expires_in * 1000).toISOString() : undefined,
    scope: json.scope,
  };
}

export function exchangeAuthorizationCode(code: string): Promise<KakaoTokens> {
  const cfg = kakaoAppConfig();
  return kauthToken({ grant_type: "authorization_code", redirect_uri: cfg.redirectUri, code });
}

export type KakaoCredentials = { accessToken: string; adAccountId: string };

// 광고주 행에서 비즈니스 토큰과 광고계정을 꺼낸다. 비즈니스 토큰은 갱신 API가 없어 만료되면(모먼트 API 401) 재연결해야 한다.
// requireAdAccount=false 이면 광고계정 미선택 상태(연결 직후 계정 목록 조회)도 허용한다.
export async function ensureKakaoAccessToken(
  _supabase: SupabaseClient,
  _clientId: string,
  row: KakaoTokenRow,
  requireAdAccount = true,
): Promise<KakaoCredentials & { shared: boolean }> {
  // 광고주 개별 연결 → API 공용 키의 공용 카카오 계정 연결(멤버로 있는 모든 광고계정 조회 가능)
  let accessToken = row?.kakao_access_token?.trim() || "";
  let shared = false;
  if (!accessToken) {
    accessToken = (await getShared("kakao"))?.config.access_token ?? "";
    shared = !!accessToken;
  }
  if (!accessToken) {
    throw new KakaoAuthError("NOT_LINKED", "카카오 계정이 연결되지 않았어요. API 공용 키 관리에서 공용 카카오 계정을 연결하거나, 광고주 관리에서 개별 연결해 주세요.");
  }
  const adAccountId = row?.kakao_ad_account_id?.trim() ?? "";
  if (requireAdAccount && !adAccountId) {
    throw new KakaoAuthError("NO_AD_ACCOUNT", "카카오모먼트 광고계정 ID가 없어요. 광고주 관리 > 매체 연동 > 카카오모먼트에서 넣어 주세요.");
  }
  return { accessToken, adAccountId, shared };
}

export const KAKAO_TOKEN_COLUMNS = "kakao_ad_account_id, kakao_access_token, kakao_token_expires_at, kakao_refresh_token, kakao_refresh_expires_at, kakao_linked_at";
