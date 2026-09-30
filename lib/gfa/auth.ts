// 네이버 성과형 디스플레이 광고(GFA) API 인증 — 네이버 로그인(OAuth 2.0) 액세스 토큰 기반. 서버 전용.
// https://naver-ad-api.github.io/developers/ (Beta, 공식 파트너사만 사용 신청 가능)
//
// 준비: 네이버 개발자센터 애플리케이션('네이버 로그인' API, 제공 정보 항목 선택 X)의 Client ID·Secret
//   → GFA 대표 관리 계정 > 설정 > API 관리 > "API 사용 신청"에 Client ID 등록 → 승인
//   → 관리 계정 멤버인 네이버 아이디로 로그인·동의(아래 OAuth) → 액세스·갱신 토큰을 공용 키(shared_media_keys.gfa)에 저장.
// 관리 계정 멤버로만 권한이 있으면 모든 호출에 AccessManagerAccountNo 헤더(관리 계정 번호)를 붙여야 하위 광고계정을 조회할 수 있다.
// 액세스 토큰은 1시간 — 만료 2분 전이면 갱신 토큰으로 재발급해 공용 키에 다시 저장한다.
// 승인 전에 동의한 토큰은 승인 후에도 "024 인증 실패" → 네이버 내정보 > 연결된 서비스에서 동의 철회 후 다시 연결.

import { getShared, patchShared, type SharedConfig } from "@/lib/sharedKeys";

const NID_AUTHORIZE = "https://nid.naver.com/oauth2.0/authorize";
const NID_TOKEN = "https://nid.naver.com/oauth2.0/token";
const REFRESH_MARGIN_MS = 2 * 60 * 1000;

// OAuth state 쿠키 — start 라우트가 굽고 callback 라우트가 읽는다(라우트 파일은 핸들러 외 export 금지)
export const GFA_STATE_COOKIE = "ctch_gfa_oauth";

export class GfaAuthError extends Error {
  code: "NOT_CONFIGURED" | "NOT_LINKED" | "NO_AD_ACCOUNT" | "TOKEN_ERROR";
  constructor(code: GfaAuthError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export type GfaApp = { clientId: string; clientSecret: string; redirectUri: string };

export function gfaRedirectUri(): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3001").replace(/\/$/, "");
  return process.env.GFA_REDIRECT_URI?.trim() || `${site}/api/gfa/oauth/callback`;
}

// Client ID·Secret — API 공용 키 관리(DB)에 넣은 값, 없으면 .env.local GFA_CLIENT_ID/GFA_CLIENT_SECRET
export function gfaAppFrom(cfg: SharedConfig | undefined | null): GfaApp {
  const clientId = cfg?.client_id?.trim() || process.env.GFA_CLIENT_ID?.trim() || "";
  const clientSecret = cfg?.client_secret?.trim() || process.env.GFA_CLIENT_SECRET?.trim() || "";
  if (!clientId || !clientSecret) {
    throw new GfaAuthError("NOT_CONFIGURED", "GFA 애플리케이션 Client ID·Secret이 없어요. API 공용 키 관리 > GFA에서 먼저 저장하세요.");
  }
  return { clientId, clientSecret, redirectUri: gfaRedirectUri() };
}

export function buildGfaAuthorizeUrl(app: GfaApp, state: string): string {
  const url = new URL(NID_AUTHORIZE);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", app.clientId);
  url.searchParams.set("redirect_uri", app.redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

type NidTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: string | number;
  error?: string;
  error_description?: string;
};

export type GfaTokens = { accessToken: string; refreshToken?: string; expiresAt: string };

async function nidToken(app: GfaApp, params: Record<string, string>): Promise<GfaTokens> {
  const body = new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, ...params });
  const res = await fetch(NID_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as NidTokenResponse;
  if (!res.ok || !json.access_token) {
    const desc = json.error_description ?? json.error ?? `HTTP ${res.status}`;
    if (json.error === "invalid_client") throw new GfaAuthError("TOKEN_ERROR", `Client ID·Secret이 맞지 않아요. (${desc})`);
    if (params.grant_type === "refresh_token") {
      throw new GfaAuthError("NOT_LINKED", `GFA 네이버 계정 연결이 만료됐어요. API 공용 키 관리 > GFA에서 다시 연결하세요. (${desc})`);
    }
    throw new GfaAuthError("TOKEN_ERROR", `네이버 토큰 발급에 실패했어요. (${desc})`);
  }
  const sec = Number(json.expires_in) || 3600;
  return { accessToken: json.access_token, refreshToken: json.refresh_token || undefined, expiresAt: new Date(Date.now() + sec * 1000).toISOString() };
}

export function exchangeGfaCode(app: GfaApp, code: string, state: string): Promise<GfaTokens> {
  return nidToken(app, { grant_type: "authorization_code", code, state });
}

export type GfaCredentials = { accessToken: string; managerAccountNo: string | null; adAccountNo: string };

// 같은 인스턴스에서 동시에 여러 요청이 만료를 만나도 갱신은 한 번만
let refreshing: Promise<string> | null = null;

async function freshAccessToken(cfg: SharedConfig): Promise<string> {
  const expiresAt = cfg.expires_at ? Date.parse(cfg.expires_at) : 0;
  if (cfg.access_token && expiresAt - REFRESH_MARGIN_MS > Date.now()) return cfg.access_token;
  if (!cfg.refresh_token) throw new GfaAuthError("NOT_LINKED", "GFA 네이버 계정이 연결되지 않았어요. API 공용 키 관리 > GFA에서 연결하세요.");
  refreshing ??= (async () => {
    try {
      const t = await nidToken(gfaAppFrom(cfg), { grant_type: "refresh_token", refresh_token: cfg.refresh_token });
      await patchShared("gfa", {
        access_token: t.accessToken,
        expires_at: t.expiresAt,
        ...(t.refreshToken ? { refresh_token: t.refreshToken } : {}),
      });
      return t.accessToken;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// 공용 연결의 유효한 액세스 토큰 + 관리 계정 번호. adAccountNo 없이 부르면(계정 목록 조회 등) 빈 문자열.
export async function getGfaCredentials(adAccountNo?: string | null, requireAdAccount = true): Promise<GfaCredentials> {
  const cfg = (await getShared("gfa"))?.config;
  if (!cfg?.refresh_token && !cfg?.access_token) {
    throw new GfaAuthError("NOT_LINKED", "GFA 네이버 계정이 연결되지 않았어요. API 공용 키 관리 > GFA에서 연결하세요.");
  }
  const no = (adAccountNo ?? "").trim();
  if (requireAdAccount && !no) {
    throw new GfaAuthError("NO_AD_ACCOUNT", "GFA 광고계정 번호가 없어요. 광고주 관리 > 매체 연동 > GFA에서 넣어 주세요.");
  }
  return { accessToken: await freshAccessToken(cfg), managerAccountNo: cfg.manager_account_no?.trim() || null, adAccountNo: no };
}
