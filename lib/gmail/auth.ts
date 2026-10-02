// 담당자 Gmail 연결(캠페인 매니저) — 서버 전용.
// 담당자 각자가 자기 회사 구글 계정으로 동의(scope gmail.readonly) → 토큰을 pm_mail_accounts(본인 행)에 저장.
// OAuth 앱은 GA4 공용 연결과 같은 GCP 클라이언트를 쓴다(API 공용 키 관리 > GA4의 Client ID·Secret, env GMAIL_CLIENT_ID/SECRET이 있으면 그것).
//   준비: GCP 콘솔에서 Gmail API 사용 설정 + OAuth 클라이언트의 승인된 리디렉션 URI에 gmailRedirectUri() 추가
//   + OAuth 동의 화면(내부)에 gmail.readonly 범위 추가. '내부' 앱이면 구글 앱 검증 없이 @nmg.co.kr 계정이 동의할 수 있다.
import { createAdminClient } from "@/lib/supabase/admin";
import { getShared } from "@/lib/sharedKeys";

const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke";
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const GMAIL_STATE_COOKIE = "ctch_gmail_oauth";
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

export class GmailAuthError extends Error {}

export type GmailApp = { clientId: string; clientSecret: string; redirectUri: string };

export function gmailRedirectUri(): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3001").replace(/\/$/, "");
  return process.env.GMAIL_REDIRECT_URI?.trim() || `${site}/api/perf-manager/gmail/callback`;
}

export async function gmailApp(): Promise<GmailApp> {
  const cfg = (await getShared("ga4"))?.config;
  const clientId = process.env.GMAIL_CLIENT_ID?.trim() || cfg?.client_id?.trim() || process.env.GA4_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim() || cfg?.client_secret?.trim() || process.env.GA4_CLIENT_SECRET?.trim() || "";
  if (!clientId || !clientSecret) throw new GmailAuthError("구글 OAuth Client ID·Secret이 없어요. 관리자에게 API 공용 키 관리 > GA4 설정을 요청하세요.");
  return { clientId, clientSecret, redirectUri: gmailRedirectUri() };
}

export function buildGmailAuthorizeUrl(app: GmailApp, state: string, loginHint?: string | null): string {
  const url = new URL(GOOGLE_AUTHORIZE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", app.redirectUri);
  url.searchParams.set("scope", `openid email profile ${GMAIL_SCOPE}`);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("hd", "nmg.co.kr");
  if (loginHint) url.searchParams.set("login_hint", loginHint);
  url.searchParams.set("state", state);
  return url.toString();
}

type TokenRes = { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; scope?: string; error?: string; error_description?: string };
export type GmailTokens = { accessToken: string; refreshToken?: string; expiresAt: string; email?: string; name?: string; scope?: string };

async function googleToken(body: URLSearchParams): Promise<GmailTokens> {
  const res = await fetch(GOOGLE_TOKEN, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as TokenRes;
  if (!res.ok || !json.access_token) {
    const desc = json.error_description ?? json.error ?? `HTTP ${res.status}`;
    if (json.error === "invalid_grant") throw new GmailAuthError(`Gmail 연결이 만료됐어요. 캠페인 매니저에서 다시 연결하세요. (${desc})`);
    throw new GmailAuthError(`구글 토큰 발급에 실패했어요. (${desc})`);
  }
  let email: string | undefined;
  let name: string | undefined;
  if (json.id_token) {
    try {
      // 토큰 엔드포인트에서 직접 받은 id_token이라 서명 검증 없이 읽는다(본인 확인은 로그인 이메일과 비교)
      const p = JSON.parse(Buffer.from(json.id_token.split(".")[1], "base64url").toString("utf8"));
      email = p.email;
      name = p.name;
    } catch {
      /* 무시 */
    }
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || undefined,
    expiresAt: new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString(),
    email,
    name,
    scope: json.scope,
  };
}

export function exchangeGmailCode(app: GmailApp, code: string): Promise<GmailTokens> {
  return googleToken(new URLSearchParams({ grant_type: "authorization_code", code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: app.redirectUri }));
}

export type MailAccountRow = {
  member_id: string;
  email: string;
  name: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  linked_at: string;
  last_synced_at: string | null;
  last_error: string | null;
};

// 유효한 액세스 토큰 — 만료 2분 전이면 리프레시 후 저장
export async function freshGmailToken(row: MailAccountRow): Promise<string> {
  const exp = row.expires_at ? Date.parse(row.expires_at) : 0;
  if (row.access_token && exp - REFRESH_MARGIN_MS > Date.now()) return row.access_token;
  if (!row.refresh_token) throw new GmailAuthError("Gmail 리프레시 토큰이 없어요. 다시 연결하세요.");
  const app = await gmailApp();
  const t = await googleToken(new URLSearchParams({ grant_type: "refresh_token", refresh_token: row.refresh_token, client_id: app.clientId, client_secret: app.clientSecret }));
  await createAdminClient()
    .from("pm_mail_accounts")
    .update({ access_token: t.accessToken, expires_at: t.expiresAt, ...(t.refreshToken ? { refresh_token: t.refreshToken } : {}) })
    .eq("member_id", row.member_id);
  return t.accessToken;
}

export async function revokeGmail(token: string | null | undefined) {
  if (!token) return;
  await fetch(`${GOOGLE_REVOKE}?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}
