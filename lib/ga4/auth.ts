// GA4(Google Analytics Data API) 인증 — 서버 전용.
// 기본: 공용 구글 계정 연결(OAuth 2.0, scope analytics.readonly). 그 구글 계정이 GA4 속성에 뷰어 이상이면 속성 ID만으로 조회한다.
//   준비: GCP 콘솔 → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID(웹 애플리케이션), 승인된 리디렉션 URI에 ga4RedirectUri()
//   → Client ID·Secret을 API 공용 키 관리 > GA4에 저장 → '구글 계정 연결'로 로그인·동의 → 토큰을 공용 키(shared_media_keys.ga4)에 저장.
//   OAuth 동의 화면이 '외부 + 테스트'면 리프레시 토큰이 7일 뒤 만료된다 → 워크스페이스 '내부'로 두거나 앱 게시.
// 예외: 서비스 계정 JSON(광고주 개별 키 또는 공용 키) — 서비스 계정 이메일이 속성에 뷰어로 추가된 경우.
// 우선순위: 광고주 개별 서비스 계정 → 공용 구글 계정 연결 → 공용 서비스 계정.
import { createSign } from "node:crypto";
import { getShared, patchShared, type SharedConfig } from "@/lib/sharedKeys";

const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

// OAuth state 쿠키 — start 라우트가 굽고 callback 라우트가 읽는다
export const GA4_STATE_COOKIE = "ctch_ga4_oauth";

export class Ga4AuthError extends Error {
  code: "NOT_CONFIGURED" | "NOT_LINKED" | "NO_PROPERTY" | "TOKEN_ERROR";
  constructor(code: Ga4AuthError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export type Ga4App = { clientId: string; clientSecret: string; redirectUri: string };

export function ga4RedirectUri(): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3001").replace(/\/$/, "");
  return process.env.GA4_REDIRECT_URI?.trim() || `${site}/api/ga4/oauth/callback`;
}

// Client ID·Secret — API 공용 키 관리(DB) 값, 없으면 .env.local GA4_CLIENT_ID/GA4_CLIENT_SECRET
export function ga4AppFrom(cfg: SharedConfig | undefined | null): Ga4App {
  const clientId = cfg?.client_id?.trim() || process.env.GA4_CLIENT_ID?.trim() || "";
  const clientSecret = cfg?.client_secret?.trim() || process.env.GA4_CLIENT_SECRET?.trim() || "";
  if (!clientId || !clientSecret) {
    throw new Ga4AuthError("NOT_CONFIGURED", "구글 OAuth Client ID·Secret이 없어요. API 공용 키 관리 > GA4에서 먼저 저장하세요.");
  }
  return { clientId, clientSecret, redirectUri: ga4RedirectUri() };
}

export function buildGa4AuthorizeUrl(app: Ga4App, state: string): string {
  const url = new URL(GOOGLE_AUTHORIZE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", app.redirectUri);
  url.searchParams.set("scope", `openid email ${GA4_SCOPE}`);
  url.searchParams.set("access_type", "offline"); // 리프레시 토큰
  url.searchParams.set("prompt", "consent"); // 재연결 때도 리프레시 토큰을 다시 받기
  url.searchParams.set("state", state);
  return url.toString();
}

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export type Ga4Tokens = { accessToken: string; refreshToken?: string; expiresAt: string; email?: string; scope?: string };

async function googleToken(body: URLSearchParams, refreshing: boolean): Promise<Ga4Tokens> {
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!res.ok || !json.access_token) {
    const desc = json.error_description ?? json.error ?? `HTTP ${res.status}`;
    if (json.error === "invalid_client") throw new Ga4AuthError("TOKEN_ERROR", `Client ID·Secret이 맞지 않아요. (${desc})`);
    if (refreshing || json.error === "invalid_grant") {
      throw new Ga4AuthError("NOT_LINKED", `구글 계정 연결이 만료됐어요. API 공용 키 관리 > GA4에서 다시 연결하세요. (${desc})`);
    }
    throw new Ga4AuthError("TOKEN_ERROR", `구글 토큰 발급에 실패했어요. (${desc})`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || undefined,
    expiresAt: new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString(),
    email: json.id_token ? emailFromIdToken(json.id_token) : undefined,
    scope: json.scope,
  };
}

// 토큰 엔드포인트에서 직접 받은 id_token이라 서명 검증 없이 이메일만 읽는다(표시용)
function emailFromIdToken(idToken: string): string | undefined {
  try {
    return JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")).email;
  } catch {
    return undefined;
  }
}

export function exchangeGa4Code(app: Ga4App, code: string): Promise<Ga4Tokens> {
  return googleToken(
    new URLSearchParams({ grant_type: "authorization_code", code, client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: app.redirectUri }),
    false,
  );
}

// 같은 인스턴스에서 동시에 여러 요청이 만료를 만나도 갱신은 한 번만
let refreshing: Promise<string> | null = null;

async function freshOAuthToken(cfg: SharedConfig): Promise<string> {
  const expiresAt = cfg.expires_at ? Date.parse(cfg.expires_at) : 0;
  if (cfg.access_token && expiresAt - REFRESH_MARGIN_MS > Date.now()) return cfg.access_token;
  if (!cfg.refresh_token) throw new Ga4AuthError("NOT_LINKED", "GA4 구글 계정이 연결되지 않았어요. API 공용 키 관리 > GA4에서 연결하세요.");
  refreshing ??= (async () => {
    try {
      const app = ga4AppFrom(cfg);
      const t = await googleToken(
        new URLSearchParams({ grant_type: "refresh_token", refresh_token: cfg.refresh_token, client_id: app.clientId, client_secret: app.clientSecret }),
        true,
      );
      await patchShared("ga4", { access_token: t.accessToken, expires_at: t.expiresAt, ...(t.refreshToken ? { refresh_token: t.refreshToken } : {}) });
      return t.accessToken;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// 서비스 계정 JSON → JWT bearer 교환(1시간). 키별로 메모리 캐시.
const saCache = new Map<string, { token: string; exp: number }>();

export function parseServiceAccount(json: string): { client_email: string; private_key: string } | null {
  try {
    const j = JSON.parse(json);
    return j.client_email && j.private_key ? { client_email: j.client_email, private_key: j.private_key } : null;
  } catch {
    return null;
  }
}

async function serviceAccountToken(json: string): Promise<string> {
  const sa = parseServiceAccount(json);
  if (!sa) throw new Ga4AuthError("TOKEN_ERROR", "서비스 계정 JSON 형식이 아니에요(client_email·private_key 필요).");
  const hit = saCache.get(sa.client_email);
  if (hit && hit.exp - REFRESH_MARGIN_MS > Date.now()) return hit.token;
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iss: sa.client_email, scope: GA4_SCOPE, aud: GOOGLE_TOKEN, iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key, "base64url");
  const t = await googleToken(new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }), false);
  saCache.set(sa.client_email, { token: t.accessToken, exp: Date.parse(t.expiresAt) });
  return t.accessToken;
}

export type Ga4Credentials = { accessToken: string; propertyId: string; source: "own_sa" | "shared_oauth" | "shared_sa"; account: string };

// 광고주의 속성 ID + 쓸 수 있는 토큰. requireProperty=false면 속성 없이 토큰만(연결 점검용).
export async function getGa4Credentials(
  client: { ga4_property_id?: string | null; ga4_service_account_json?: string | null } | null,
  requireProperty = true,
): Promise<Ga4Credentials> {
  const propertyId = (client?.ga4_property_id ?? "").replace(/^properties\//, "").trim();
  if (requireProperty && !propertyId) throw new Ga4AuthError("NO_PROPERTY", "GA4 속성 ID가 없어요. 광고주 관리 > 매체 연동 > GA4에서 넣어 주세요.");

  const own = client?.ga4_service_account_json?.trim();
  if (own) return { accessToken: await serviceAccountToken(own), propertyId, source: "own_sa", account: parseServiceAccount(own)?.client_email ?? "" };

  const cfg = (await getShared("ga4"))?.config;
  if (cfg?.refresh_token || cfg?.access_token) {
    return { accessToken: await freshOAuthToken(cfg), propertyId, source: "shared_oauth", account: cfg.linked_email ?? "" };
  }
  if (cfg?.service_account_json) {
    return { accessToken: await serviceAccountToken(cfg.service_account_json), propertyId, source: "shared_sa", account: parseServiceAccount(cfg.service_account_json)?.client_email ?? "" };
  }
  throw new Ga4AuthError("NOT_LINKED", "GA4 구글 계정이 연결되지 않았어요. API 공용 키 관리 > GA4에서 '구글 계정 연결'을 하세요.");
}
