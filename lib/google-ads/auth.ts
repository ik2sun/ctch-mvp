// 구글 Ads API 인증 — 서버 전용.
// 2026-09-09 Developer Token 폐지: API 사용 등급(Test/Explorer/Basic/Standard)은 OAuth 클라이언트를 만든 GCP 프로젝트에 붙는다.
//   → OAuth 클라이언트는 반드시 등급을 받은 프로젝트(ctch, ctch-503703 — Explorer) 것이어야 한다. GA4 클라이언트(Default Gemini Project)는 쓰면 안 됨.
// 방식: 공용 구글 계정 연결(OAuth 2.0, scope adwords). 그 구글 계정이 NMG MCC에 접근 가능하면 광고주에는 Customer ID만.
//   준비: ctch 프로젝트 OAuth 클라이언트(웹)의 승인된 리디렉션 URI에 googleAdsRedirectUri() 추가
//   → API 공용 키 관리 > 구글 Ads에 MCC ID 저장(Client ID·Secret은 비우면 env GOOGLE_ADS_CLIENT_* → GMAIL_CLIENT_*(같은 ctch 클라이언트))
//   → '구글 계정 연결' → 토큰을 공용 키(shared_media_keys.google_ads)에 저장.
import { getShared, patchShared, type SharedConfig } from "@/lib/sharedKeys";

const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const GADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

export const GADS_STATE_COOKIE = "ctch_gads_oauth";

export class GoogleAdsAuthError extends Error {
  code: "NOT_CONFIGURED" | "NOT_LINKED" | "NO_CUSTOMER" | "TOKEN_ERROR";
  constructor(code: GoogleAdsAuthError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export type GoogleAdsApp = { clientId: string; clientSecret: string; redirectUri: string };

export function googleAdsRedirectUri(): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3001").replace(/\/$/, "");
  return process.env.GOOGLE_ADS_REDIRECT_URI?.trim() || `${site}/api/google-ads/oauth/callback`;
}

// Client ID·Secret — 공용 키(DB) → env GOOGLE_ADS_CLIENT_ID/SECRET → env GMAIL_CLIENT_ID/SECRET(ctch 프로젝트 'CTCH Gmail 연결' 클라이언트)
export function googleAdsAppFrom(cfg: SharedConfig | undefined | null): GoogleAdsApp {
  const pairs: [string | undefined, string | undefined][] = [
    [cfg?.client_id, cfg?.client_secret],
    [process.env.GOOGLE_ADS_CLIENT_ID, process.env.GOOGLE_ADS_CLIENT_SECRET],
    [process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET],
  ];
  const hit = pairs.find(([id, secret]) => id?.trim() && secret?.trim());
  if (!hit) {
    throw new GoogleAdsAuthError("NOT_CONFIGURED", "구글 OAuth Client ID·Secret이 없어요. API 공용 키 관리 > 구글 Ads에 ctch 프로젝트의 OAuth 클라이언트를 저장하세요.");
  }
  return { clientId: hit[0]!.trim(), clientSecret: hit[1]!.trim(), redirectUri: googleAdsRedirectUri() };
}

export function buildGoogleAdsAuthorizeUrl(app: GoogleAdsApp, state: string): string {
  const url = new URL(GOOGLE_AUTHORIZE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", app.redirectUri);
  url.searchParams.set("scope", `openid email ${GADS_SCOPE}`);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

type GoogleTokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; scope?: string; error?: string; error_description?: string };
export type GoogleAdsTokens = { accessToken: string; refreshToken?: string; expiresAt: string; email?: string; scope?: string };

async function googleToken(body: URLSearchParams, refreshing: boolean): Promise<GoogleAdsTokens> {
  const res = await fetch(GOOGLE_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!res.ok || !json.access_token) {
    const desc = json.error_description ?? json.error ?? `HTTP ${res.status}`;
    if (json.error === "invalid_client") throw new GoogleAdsAuthError("TOKEN_ERROR", `Client ID·Secret이 맞지 않아요. (${desc})`);
    if (refreshing || json.error === "invalid_grant") {
      throw new GoogleAdsAuthError("NOT_LINKED", `구글 계정 연결이 만료됐어요. API 공용 키 관리 > 구글 Ads에서 다시 연결하세요. (${desc})`);
    }
    throw new GoogleAdsAuthError("TOKEN_ERROR", `구글 토큰 발급에 실패했어요. (${desc})`);
  }
  let email: string | undefined;
  try {
    email = json.id_token ? JSON.parse(Buffer.from(json.id_token.split(".")[1], "base64url").toString("utf8")).email : undefined; // 표시용
  } catch {
    /* 무시 */
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || undefined,
    expiresAt: new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString(),
    email,
    scope: json.scope,
  };
}

export function exchangeGoogleAdsCode(app: GoogleAdsApp, code: string): Promise<GoogleAdsTokens> {
  return googleToken(
    new URLSearchParams({ grant_type: "authorization_code", code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: app.redirectUri }),
    false,
  );
}

let refreshing: Promise<string> | null = null;

async function freshToken(cfg: SharedConfig): Promise<string> {
  const expiresAt = cfg.expires_at ? Date.parse(cfg.expires_at) : 0;
  if (cfg.access_token && expiresAt - REFRESH_MARGIN_MS > Date.now()) return cfg.access_token;
  if (!cfg.refresh_token) throw new GoogleAdsAuthError("NOT_LINKED", "구글 Ads 구글 계정이 연결되지 않았어요. API 공용 키 관리 > 구글 Ads에서 연결하세요.");
  refreshing ??= (async () => {
    try {
      const app = googleAdsAppFrom(cfg);
      const t = await googleToken(
        new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.refresh_token, client_id: app.clientId, client_secret: app.clientSecret }),
        true,
      );
      await patchShared("google_ads", { access_token: t.accessToken, expires_at: t.expiresAt, ...(t.refreshToken ? { refresh_token: t.refreshToken } : {}) });
      return t.accessToken;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export const digitsOnly = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export type GoogleAdsCredentials = { accessToken: string; customerId: string; loginCustomerId: string; account: string };

// 광고주의 Customer ID + 토큰 + MCC ID(login-customer-id). requireCustomer=false면 토큰만(연결 점검용).
export async function getGoogleAdsCredentials(client: { google_ads_customer_id?: string | null } | null, requireCustomer = true): Promise<GoogleAdsCredentials> {
  const customerId = digitsOnly(client?.google_ads_customer_id);
  if (requireCustomer && !customerId) throw new GoogleAdsAuthError("NO_CUSTOMER", "구글 Ads Customer ID가 없어요. 광고주 관리 > 매체 연동 > 구글 Ads에서 넣어 주세요.");
  const cfg = (await getShared("google_ads"))?.config;
  if (!cfg?.refresh_token && !cfg?.access_token) {
    throw new GoogleAdsAuthError("NOT_LINKED", "구글 Ads 구글 계정이 연결되지 않았어요. API 공용 키 관리 > 구글 Ads에서 '구글 계정 연결'을 하세요.");
  }
  return { accessToken: await freshToken(cfg), customerId, loginCustomerId: digitsOnly(cfg.login_customer_id), account: cfg.linked_email ?? "" };
}
