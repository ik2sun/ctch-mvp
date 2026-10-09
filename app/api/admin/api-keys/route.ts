import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getKeyManager } from "@/lib/supabase/requireKeyManager";
import { getShared, saveShared, deleteShared, sharedTableReady, maskKey, SHARED_CHANNELS, type SharedChannel, type SharedConfig } from "@/lib/sharedKeys";
import { SHARED_DEFS } from "@/features/admin/sharedKeyDefs";
import { probeNaverCustomer } from "@/lib/naver-ad/probe";
import { fetchAdAccounts } from "@/lib/kakao-moment/aggregate";
import { getGfaCredentials, gfaRedirectUri } from "@/lib/gfa/auth";
import { fetchManagerChildAdAccounts, fetchMyAdAccounts as fetchGfaMyAdAccounts, fetchMyManagerAccounts } from "@/lib/gfa/aggregate";
import { getGa4Credentials, ga4RedirectUri, parseServiceAccount } from "@/lib/ga4/auth";
import { fetchAccessibleProperties, probeProperty } from "@/lib/ga4/client";
import { digitsOnly, getGoogleAdsCredentials, googleAdsAppFrom, googleAdsRedirectUri } from "@/lib/google-ads/auth";
import { fetchMccChildren, probeCustomer } from "@/lib/google-ads/aggregate";

// API 공용 키 관리 (관리자·최고관리자) — 키 값은 응답에 마스킹해서만 내려준다.
// GET: 매체별 등록 상태 / POST {channel, action:"test"|"save"|"import", config?}: 테스트(+저장), import = 지금 쓰는 .env.local 값을 테스트 후 DB로 옮김 / DELETE ?channel=: DB 공용 키 삭제
const GRAPH = "https://graph.facebook.com/v25.0";

type ClientRow = {
  name: string;
  meta_account_id: string | null;
  meta_access_token: string | null;
  naver_ad_customer_id: string | null;
  naver_ad_api_key: string | null;
  kakao_ad_account_id: string | null;
  kakao_access_token: string | null;
  gfa_customer_id: string | null;
  ga4_property_id: string | null;
  ga4_service_account_json: string | null;
  google_ads_customer_id: string | null;
};
type ClientCheck = { clientName: string; accountId: string; ownKey: boolean; ok: boolean; detail: string };
type TestResult = { ok: boolean; message: string; clients: ClientCheck[] };

async function allClients(): Promise<ClientRow[]> {
  const { data } = await createAdminClient()
    .from("clients")
    .select("name, meta_account_id, meta_access_token, naver_ad_customer_id, naver_ad_api_key, kakao_ad_account_id, kakao_access_token, gfa_customer_id, ga4_property_id, ga4_service_account_json, google_ads_customer_id")
    .order("name");
  return (data ?? []) as ClientRow[];
}

async function testMeta(token: string): Promise<TestResult> {
  const t = encodeURIComponent(token);
  const me = await (await fetch(`${GRAPH}/me?fields=id,name&access_token=${t}`)).json();
  if (me.error) return { ok: false, message: `토큰 확인 실패 — ${me.error.message}`, clients: [] };
  const clients: ClientCheck[] = [];
  for (const c of await allClients()) {
    if (!c.meta_account_id) continue;
    const r = await (await fetch(`${GRAPH}/${c.meta_account_id}?fields=name,account_status&access_token=${t}`)).json();
    clients.push({
      clientName: c.name,
      accountId: c.meta_account_id,
      ownKey: !!c.meta_access_token,
      ok: !r.error,
      detail: r.error ? String(r.error.message) : String(r.name),
    });
  }
  return { ok: true, message: `토큰 정상 — ${me.name}`, clients };
}

async function testNaver(cfg: SharedConfig): Promise<TestResult> {
  if (!cfg.api_key || !cfg.secret) return { ok: false, message: "엑세스라이선스·비밀키를 입력하세요.", clients: [] };
  const creds = (customerId: string) => ({ apiKey: cfg.api_key, secretKey: cfg.secret, customerId });
  let message = "키 저장 가능";
  if (cfg.owner_customer_id) {
    const owner = await probeNaverCustomer(creds(cfg.owner_customer_id));
    if (!owner.ok) return { ok: false, message: `발급 계정(${cfg.owner_customer_id})으로 조회되지 않아요 — ${owner.error}`, clients: [] };
    message = `키 정상 — 발급 계정 캠페인 ${owner.campaigns}개`;
  }
  const clients: ClientCheck[] = [];
  for (const c of await allClients()) {
    if (!c.naver_ad_customer_id) continue;
    const p = await probeNaverCustomer(creds(c.naver_ad_customer_id));
    clients.push({
      clientName: c.name,
      accountId: c.naver_ad_customer_id,
      ownKey: !!c.naver_ad_api_key,
      ok: p.ok,
      detail: p.ok ? `캠페인 ${p.campaigns}개${p.sample.length ? ` (${p.sample.join(", ")})` : ""}` : p.error,
    });
  }
  // 발급 계정 번호 없이 테스트한 경우 — 광고주 고객 ID 중 하나라도 조회돼야 키가 맞다고 본다
  if (!cfg.owner_customer_id) {
    if (clients.length === 0) return { ok: false, message: "키를 확인할 계정이 없어요. 키를 발급한 대행사 계정 번호를 넣거나, 광고주 관리에서 고객 ID를 먼저 등록하세요.", clients };
    if (!clients.some((c) => c.ok)) return { ok: false, message: "등록된 광고주 고객 ID 중 이 키로 조회되는 곳이 없어요. 키가 맞는지, 대행사 계정 키인지 확인하세요.", clients };
    message = `키 정상 — 광고주 ${clients.filter((c) => c.ok).length}/${clients.length}곳 조회됨`;
  }
  return { ok: true, message, clients };
}

async function testKakao(token: string): Promise<TestResult> {
  let accounts: { id: number | string; name: string }[];
  try {
    accounts = await fetchAdAccounts(token);
  } catch (e) {
    return { ok: false, message: `카카오 연결 확인 실패 — ${e instanceof Error ? e.message : "오류"}`, clients: [] };
  }
  const ids = new Map(accounts.map((a) => [String(a.id), a.name]));
  const clients: ClientCheck[] = [];
  for (const c of await allClients()) {
    if (!c.kakao_ad_account_id) continue;
    const name = ids.get(c.kakao_ad_account_id);
    clients.push({
      clientName: c.name,
      accountId: c.kakao_ad_account_id,
      ownKey: !!c.kakao_access_token,
      ok: !!name,
      detail: name ?? "공용 카카오 계정이 이 광고계정의 멤버가 아니에요",
    });
  }
  return { ok: true, message: `연결 정상 — 접근 가능한 광고계정 ${accounts.length}개`, clients };
}

// GFA 연결 토큰(네이버 로그인) — 앱(Client ID)이 바뀌면 이전 토큰은 무효라 버린다
const GFA_TOKEN_KEYS = ["access_token", "refresh_token", "expires_at", "linked_at"];
function gfaTokensOf(stored: SharedConfig | undefined, clientId: string | undefined): SharedConfig {
  if (!stored || (clientId && stored.client_id && stored.client_id !== clientId)) return {};
  return Object.fromEntries(GFA_TOKEN_KEYS.filter((k) => stored[k]).map((k) => [k, stored[k]]));
}

async function testGfa(cfg: SharedConfig): Promise<TestResult> {
  const err = validateStatic("gfa", cfg);
  if (err) return { ok: false, message: err, clients: [] };
  if (!cfg.refresh_token && !cfg.access_token) {
    return { ok: true, message: "형식 확인 완료 — 저장한 뒤 '네이버 계정 연결'을 눌러야 조회할 수 있어요.", clients: [] };
  }
  let token: string;
  try {
    token = (await getGfaCredentials(null, false)).accessToken;
  } catch (e) {
    return { ok: false, message: `네이버 연결 확인 실패 — ${e instanceof Error ? e.message : "오류"}`, clients: [] };
  }
  const manager = cfg.manager_account_no?.replace(/-/g, "") || "";
  let message: string;
  const reachable = new Set<string>();
  try {
    for (const a of await fetchGfaMyAdAccounts(token)) reachable.add(String(a.no));
    if (manager) {
      const tree = await fetchManagerChildAdAccounts(token, manager);
      tree.adAccountNos.forEach((n) => reachable.add(n));
      message = `연결 정상 — 관리 계정 '${tree.name}' 하위 광고계정 ${tree.adAccountNos.length}개`;
    } else {
      const managers = await fetchMyManagerAccounts(token);
      message = `연결 정상 — 직접 멤버인 광고계정 ${reachable.size}개${managers.length ? ` · 관리 계정 ${managers.map((m) => `${m.name}(${m.no})`).join(", ")} 중 하나를 번호로 넣으세요` : ""}`;
    }
  } catch (e) {
    return { ok: false, message: `GFA API 호출 실패 — ${e instanceof Error ? e.message : "오류"}`, clients: [] };
  }
  const clients: ClientCheck[] = [];
  for (const c of await allClients()) {
    if (!c.gfa_customer_id) continue;
    const ok = reachable.has(c.gfa_customer_id.trim());
    clients.push({ clientName: c.name, accountId: c.gfa_customer_id, ownKey: false, ok, detail: ok ? "접근 가능" : "관리 계정 하위·직접 멤버 광고계정에 없어요" });
  }
  return { ok: true, message, clients };
}

// GA4·구글 Ads — 저장된 config를 유지한 채 입력한 값만 바꾼다. OAuth Client ID가 바뀌면 이전 구글 연결 토큰은 무효라 버린다.
const GA4_TOKEN_KEYS = ["access_token", "refresh_token", "expires_at", "linked_at", "linked_email"];
function linkedMerge(stored: SharedConfig | undefined, input: SharedConfig): SharedConfig {
  const base = { ...(stored ?? {}) };
  if (input.client_id && base.client_id && base.client_id !== input.client_id) GA4_TOKEN_KEYS.forEach((k) => delete base[k]);
  return { ...base, ...input };
}

async function testGa4(cfg: SharedConfig): Promise<TestResult> {
  const err = validateStatic("ga4", cfg);
  if (err) return { ok: false, message: err, clients: [] };
  const linked = !!(cfg.refresh_token || cfg.access_token);
  if (!linked && !cfg.service_account_json) {
    return { ok: true, message: "형식 확인 완료 — 저장한 뒤 '구글 계정 연결'을 눌러야 조회할 수 있어요.", clients: [] };
  }
  let token: string;
  let account: string;
  try {
    // 연결 토큰은 저장된 값(자동 갱신 포함)으로, 서비스 계정만 있으면 입력한 JSON으로
    const c = linked ? await getGa4Credentials(null, false) : await getGa4Credentials({ ga4_service_account_json: cfg.service_account_json }, false);
    token = c.accessToken;
    account = c.account;
  } catch (e) {
    return { ok: false, message: `구글 인증 실패 — ${e instanceof Error ? e.message : "오류"}`, clients: [] };
  }
  let message = `연결 정상 — ${account || "구글 계정"}`;
  try {
    const props = await fetchAccessibleProperties(token);
    message += ` · 접근 가능한 GA4 속성 ${props.length}개`;
  } catch {
    message += " (속성 목록은 'Google Analytics Admin API'를 켜면 보여요)";
  }
  const clients: ClientCheck[] = [];
  for (const c of await allClients()) {
    const pid = c.ga4_property_id?.trim();
    if (!pid) continue;
    try {
      const p = await probeProperty(token, pid);
      clients.push({ clientName: c.name, accountId: pid, ownKey: !!c.ga4_service_account_json, ok: true, detail: `최근 7일 세션 ${p.sessions.toLocaleString("ko-KR")}` });
    } catch (e) {
      clients.push({ clientName: c.name, accountId: pid, ownKey: !!c.ga4_service_account_json, ok: false, detail: e instanceof Error ? e.message : "조회 실패" });
    }
  }
  return { ok: true, message, clients };
}

async function testGoogleAds(cfg: SharedConfig): Promise<TestResult> {
  const err = validateStatic("google_ads", cfg);
  if (err) return { ok: false, message: err, clients: [] };
  if (!cfg.refresh_token && !cfg.access_token) {
    return { ok: true, message: "형식 확인 완료 — 저장한 뒤 '구글 계정 연결'을 눌러야 조회할 수 있어요.", clients: [] };
  }
  const mcc = digitsOnly(cfg.login_customer_id);
  let creds;
  try {
    creds = { ...(await getGoogleAdsCredentials(null, false)), loginCustomerId: mcc };
  } catch (e) {
    return { ok: false, message: `구글 인증 실패 — ${e instanceof Error ? e.message : "오류"}`, clients: [] };
  }
  let message: string;
  let children: Map<string, string>;
  try {
    const kids = await fetchMccChildren(creds, mcc);
    children = new Map(kids.map((k) => [k.id, k.name]));
    message = `연결 정상 — ${creds.account || "구글 계정"} · MCC ${mcc} 하위 광고계정 ${kids.length}개`;
  } catch (e) {
    return { ok: false, message: `MCC ${mcc} 조회 실패 — ${e instanceof Error ? e.message : "오류"}`, clients: [] };
  }
  const clients: ClientCheck[] = [];
  for (const c of await allClients()) {
    const id = digitsOnly(c.google_ads_customer_id);
    if (!id) continue;
    try {
      const p = await probeCustomer(creds, id);
      clients.push({ clientName: c.name, accountId: id, ownKey: false, ok: true, detail: `${p.name || children.get(id) || "계정"} · 활성 캠페인 ${p.campaigns}개${p.currency && p.currency !== "KRW" ? ` · 통화 ${p.currency}` : ""}` });
    } catch (e) {
      clients.push({ clientName: c.name, accountId: id, ownKey: false, ok: false, detail: e instanceof Error ? e.message : "조회 실패" });
    }
  }
  return { ok: true, message, clients };
}

function validateStatic(channel: SharedChannel, cfg: SharedConfig): string | null {
  const def = SHARED_DEFS.find((d) => d.channel === channel)!;
  for (const f of def.fields) {
    if (!f.optional && !cfg[f.key]?.trim()) return `${f.label}을(를) 입력하세요.`;
    if (f.digits && cfg[f.key] && !/^\d+$/.test(cfg[f.key].replace(/-/g, ""))) return `${f.label}은(는) 숫자만 입력하세요.`;
  }
  if (channel === "ga4") {
    if (!!cfg.client_id !== !!cfg.client_secret) return "OAuth Client ID와 Secret을 함께 넣어 주세요.";
    if (!cfg.client_id && !cfg.service_account_json) return "OAuth Client ID·Secret(구글 계정 연결용)을 넣어 주세요.";
    if (cfg.service_account_json && !parseServiceAccount(cfg.service_account_json)) return "서비스 계정 JSON 형식이 아니에요(client_email·private_key 필요).";
  }
  if (channel === "google_ads") {
    if (!!cfg.client_id !== !!cfg.client_secret) return "OAuth Client ID와 Secret을 함께 넣어 주세요.";
    try {
      googleAdsAppFrom(cfg);
    } catch (e) {
      return e instanceof Error ? e.message : "OAuth 클라이언트가 없어요.";
    }
  }
  return null;
}

async function runTest(channel: SharedChannel, cfg: SharedConfig): Promise<TestResult> {
  if (channel === "meta") return testMeta(cfg.access_token);
  if (channel === "naver") return testNaver(cfg);
  if (channel === "kakao") return testKakao(cfg.access_token);
  if (channel === "gfa") return testGfa(cfg);
  if (channel === "ga4") return testGa4(cfg);
  if (channel === "google_ads") return testGoogleAds(cfg);
  const err = validateStatic(channel, cfg);
  return err ? { ok: false, message: err, clients: [] } : { ok: true, message: "형식 확인 완료 (이 매체는 아직 실제 조회를 지원하지 않아요)", clients: [] };
}

export async function GET() {
  if (!(await getKeyManager())) return NextResponse.json({ error: "권한이 없어요." }, { status: 403 });
  const channels: Record<string, unknown> = {};
  for (const ch of SHARED_CHANNELS) {
    const entry = await getShared(ch);
    const def = SHARED_DEFS.find((d) => d.channel === ch)!;
    const display: Record<string, string> = {};
    if (entry) {
      for (const f of def.fields) {
        const v = entry.config[f.key];
        if (v) display[f.key] = f.secret ? maskKey(f.textarea ? (safeEmail(v) ?? v) : v) : v;
      }
      if ((ch === "kakao" || ch === "gfa" || ch === "ga4" || ch === "google_ads") && entry.config.linked_at) display.linked_at = entry.config.linked_at;
      if ((ch === "ga4" || ch === "google_ads") && entry.config.refresh_token && entry.config.linked_email) display.linked_email = entry.config.linked_email;
    }
    channels[ch] = entry
      ? {
          configured: ch === "kakao" ? !!entry.config.access_token : true,
          ...(ch === "gfa" || ch === "ga4" || ch === "google_ads" ? { linked: !!entry.config.refresh_token } : {}),
          source: entry.source,
          updatedAt: entry.updatedAt,
          display,
        }
      : { configured: false, source: null, updatedAt: null, display: {} };
  }
  return NextResponse.json({ tableReady: await sharedTableReady(), kakaoConfigured: !!process.env.KAKAO_REST_API_KEY, gfaRedirectUri: gfaRedirectUri(), ga4RedirectUri: ga4RedirectUri(), googleAdsRedirectUri: googleAdsRedirectUri(), channels });
}

function safeEmail(json: string): string | null {
  try {
    return (JSON.parse(json).client_email as string) ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const manager = await getKeyManager();
  if (!manager) return NextResponse.json({ error: "권한이 없어요." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { channel?: SharedChannel; action?: "test" | "save" | "import"; config?: SharedConfig };
  const channel = body.channel;
  if (!channel || !SHARED_CHANNELS.includes(channel)) return NextResponse.json({ error: "지원하지 않는 매체예요." }, { status: 400 });

  // config를 안 보내면 현재 저장된(또는 env) 공용 키로 테스트 — "다시 점검"
  const stored = await getShared(channel);
  const input = Object.fromEntries(Object.entries(body.config ?? {}).map(([k, v]) => [k, String(v ?? "").trim()]).filter(([, v]) => v));
  // GFA는 저장된 네이버 연결 토큰을 유지한 채 앱 정보·관리 계정 번호만 바꾼다
  const cfg: SharedConfig = body.config
    ? channel === "gfa"
      ? { ...gfaTokensOf(stored?.config, input.client_id), ...input }
      : channel === "ga4" || channel === "google_ads"
        ? linkedMerge(stored?.source === "db" ? stored.config : undefined, input)
        : input
    : (stored?.config ?? {});
  if (channel === "kakao" && body.action === "save") return NextResponse.json({ error: "카카오는 '공용 카카오 계정 연결'로 등록해요." }, { status: 400 });
  if (!body.config && !stored) return NextResponse.json({ ok: false, message: "등록된 공용 키가 없어요.", clients: [] });
  if (body.action === "import" && stored?.source !== "env") return NextResponse.json({ ok: false, message: "옮길 .env.local 값이 없어요.", clients: [] });

  const result = await runTest(channel, cfg);
  if ((body.action !== "save" && body.action !== "import") || !result.ok) return NextResponse.json(result);

  const err = await saveShared(channel, cfg, manager.userId);
  if (err) return NextResponse.json({ ...result, ok: false, message: "저장에 실패했어요. supabase/migrations/0015_shared_media_keys.sql을 실행했는지 확인하세요." });
  return NextResponse.json({ ...result, saved: true, message: `저장했어요. ${result.message}` });
}

export async function DELETE(req: Request) {
  if (!(await getKeyManager())) return NextResponse.json({ error: "권한이 없어요." }, { status: 403 });
  const channel = new URL(req.url).searchParams.get("channel") as SharedChannel | null;
  if (!channel || !SHARED_CHANNELS.includes(channel)) return NextResponse.json({ error: "지원하지 않는 매체예요." }, { status: 400 });
  const err = await deleteShared(channel);
  if (err) return NextResponse.json({ error: "삭제에 실패했어요." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
