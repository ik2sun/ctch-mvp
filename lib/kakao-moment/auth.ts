// 카카오모먼트 인증 — 카카오 로그인 OAuth(비즈니스 토큰) 기반.
// 앱 단위 설정(REST API 키·Client Secret·Redirect URI)은 .env.local, 광고주 단위 토큰은 clients 행에 저장한다.
// 액세스 토큰(약 12시간)은 만료 전에 리프레시 토큰(약 60일)으로 자동 갱신하고, 갱신 결과를 clients 행에 되써 준다.

import type { SupabaseClient } from "@supabase/supabase-js";

const KAUTH_AUTHORIZE = "https://kauth.kakao.com/oauth/authorize";
const KAUTH_TOKEN = "https://kauth.kakao.com/oauth/token";
const REFRESH_MARGIN_MS = 5 * 60 * 1000; // 만료 5분 전이면 미리 갱신

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

export function kakaoAppConfig(): { restApiKey: string; clientSecret?: string; redirectUri: string; scope?: string } {
  const restApiKey = process.env.KAKAO_REST_API_KEY?.trim();
  if (!restApiKey) {
    throw new KakaoAuthError("NOT_CONFIGURED", "서버에 KAKAO_REST_API_KEY가 없어요. 카카오디벨로퍼스 앱의 REST API 키를 .env.local에 넣어 주세요.");
  }
  const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3001").replace(/\/$/, "");
  return {
    restApiKey,
    clientSecret: process.env.KAKAO_CLIENT_SECRET?.trim() || undefined,
    redirectUri: process.env.KAKAO_REDIRECT_URI?.trim() || `${site}/api/kakao-moment/oauth/callback`,
    scope: process.env.KAKAO_OAUTH_SCOPE?.trim() || undefined,
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
  if (cfg.scope) url.searchParams.set("scope", cfg.scope);
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
  if (!res.ok || !json.access_token || !json.expires_in) {
    const desc = json.error_description ?? json.error ?? `HTTP ${res.status}`;
    // 리프레시 토큰이 만료/폐기된 경우 카카오는 invalid_grant 를 준다 → 재연결 안내
    if (json.error === "invalid_grant") throw new KakaoAuthError("REFRESH_EXPIRED", "카카오 연결이 만료되었어요. 광고주 관리에서 카카오 계정을 다시 연결해 주세요.");
    throw new KakaoAuthError("TOKEN_ERROR", `카카오 토큰 발급에 실패했어요. (${desc})`);
  }
  const now = Date.now();
  return {
    accessToken: json.access_token,
    expiresAt: new Date(now + json.expires_in * 1000).toISOString(),
    refreshToken: json.refresh_token,
    refreshExpiresAt: json.refresh_token_expires_in ? new Date(now + json.refresh_token_expires_in * 1000).toISOString() : undefined,
    scope: json.scope,
  };
}

export function exchangeAuthorizationCode(code: string): Promise<KakaoTokens> {
  const cfg = kakaoAppConfig();
  return kauthToken({ grant_type: "authorization_code", redirect_uri: cfg.redirectUri, code });
}

export function refreshAccessToken(refreshToken: string): Promise<KakaoTokens> {
  return kauthToken({ grant_type: "refresh_token", refresh_token: refreshToken });
}

export type KakaoCredentials = { accessToken: string; adAccountId: string };

// 광고주 행의 토큰을 검사해 유효한 액세스 토큰을 돌려준다. 만료가 가까우면 갱신하고 DB에 반영한다.
// requireAdAccount=false 이면 광고계정 미선택 상태(연결 직후 계정 목록 조회)도 허용한다.
export async function ensureKakaoAccessToken(
  supabase: SupabaseClient,
  clientId: string,
  row: KakaoTokenRow,
  requireAdAccount = true,
): Promise<KakaoCredentials> {
  if (!row?.kakao_refresh_token) {
    throw new KakaoAuthError("NOT_LINKED", "이 광고주에 카카오 계정이 연결되지 않았어요. 광고주 관리 > 카카오모먼트에서 연결해 주세요.");
  }
  if (row.kakao_refresh_expires_at && new Date(row.kakao_refresh_expires_at).getTime() < Date.now()) {
    throw new KakaoAuthError("REFRESH_EXPIRED", "카카오 연결이 만료되었어요(리프레시 토큰 60일). 광고주 관리에서 카카오 계정을 다시 연결해 주세요.");
  }
  const adAccountId = row.kakao_ad_account_id?.trim() ?? "";
  if (requireAdAccount && !adAccountId) {
    throw new KakaoAuthError("NO_AD_ACCOUNT", "카카오모먼트 광고계정이 선택되지 않았어요. 광고주 관리 > 카카오모먼트에서 광고계정을 선택해 주세요.");
  }

  const expiresAt = row.kakao_token_expires_at ? new Date(row.kakao_token_expires_at).getTime() : 0;
  if (row.kakao_access_token && expiresAt - Date.now() > REFRESH_MARGIN_MS) {
    return { accessToken: row.kakao_access_token, adAccountId };
  }

  const tokens = await refreshAccessToken(row.kakao_refresh_token);
  const update: Record<string, string> = { kakao_access_token: tokens.accessToken, kakao_token_expires_at: tokens.expiresAt };
  if (tokens.refreshToken) update.kakao_refresh_token = tokens.refreshToken;
  if (tokens.refreshExpiresAt) update.kakao_refresh_expires_at = tokens.refreshExpiresAt;
  await supabase.from("clients").update(update).eq("id", clientId);
  return { accessToken: tokens.accessToken, adAccountId };
}

export const KAKAO_TOKEN_COLUMNS = "kakao_ad_account_id, kakao_access_token, kakao_token_expires_at, kakao_refresh_token, kakao_refresh_expires_at, kakao_linked_at";
