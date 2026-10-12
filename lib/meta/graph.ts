// 메타 Graph API 공용 호출 — 페이지 끝까지 받기, ids 묶음 조회, 인사이트 지표 해석. 서버 전용.
// 2026-10-12 v26.0 — 토큰을 새 앱(NMG-CTCH)으로 바꾼 뒤 메타가 v25 요청을 v26으로 처리(새 앱은 만든 시점 최신 버전 미만 불가, 응답 헤더 facebook-api-version: v26.0).
// v26부터 ?ids= 묶음 조회가 없어져(100 "The ids query parameter is deprecated in v26.0+") 묶음 조회는 배치 API로(graphByIds)
export const META_API_VERSION = "v26.0";
const G = `https://graph.facebook.com/${META_API_VERSION}`;

export class MetaGraphError extends Error {
  code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

// 앱 단위 호출 한도 — 메타가 응답마다 주는 x-app-usage(call_count %, 최근 1시간)를 기억해 두고,
// 90% 이상이면 새 호출을 막는다(넘기면 #4로 앱 전체가 1시간가량 막힘). 같은 서버 프로세스 안에서만 공유.
const USAGE_GUARD = 90;
const USAGE_TTL_MS = 10 * 60 * 1000;
let lastUsage: { pct: number; at: number } | null = null;

export function metaAppUsage(): number | null {
  return lastUsage && Date.now() - lastUsage.at < USAGE_TTL_MS ? lastUsage.pct : null;
}

const LIMIT_CODES = new Set([4, 17, 32, 613, 80000, 80004]);
function friendly(code: number | undefined, msg: string) {
  if (code != null && LIMIT_CODES.has(code)) return `메타 호출 한도를 넘었어요(코드 ${code}). 토큰은 정상이고, 보통 1시간 안에 자동으로 풀려요 — 그동안 메타 화면 새로고침을 줄여 주세요. (${msg})`;
  return msg;
}

async function getJson(url: string) {
  const u = metaAppUsage();
  if (u != null && u >= USAGE_GUARD) {
    throw new MetaGraphError(`메타 호출 한도 임박(앱 사용량 ${u}%) — 한도를 넘기지 않으려고 조회를 멈췄어요. 잠시 후 다시 시도해 주세요.`, 4);
  }
  const res = await fetch(url, { cache: "no-store" });
  const usage = res.headers.get("x-app-usage");
  if (usage) {
    try {
      const j = JSON.parse(usage) as { call_count?: number; total_time?: number; total_cputime?: number };
      lastUsage = { pct: Math.max(j.call_count ?? 0, j.total_time ?? 0, j.total_cputime ?? 0), at: Date.now() };
    } catch {
      /* 헤더 형식이 다르면 무시 */
    }
  }
  const json = await res.json().catch(() => ({}));
  if (json.error) throw new MetaGraphError(friendly(json.error.code, json.error.message ?? "메타 API 오류"), json.error.code);
  return json;
}

// 쓰기(생성·수정) — 본문은 form 인코딩(객체·배열 칸은 JSON 문자열). 실패하면 메타가 주는 사용자용 문구(error_user_title·msg)를 우선.
// 쓰기는 다시 보내면 중복 생성될 수 있어 재시도하지 않는다. validateOnly = 실제로 만들지 않고 검증만(execution_options)
export async function graphPost<T = Record<string, unknown>>(path: string, params: Record<string, unknown>, token: string, opts: { validateOnly?: boolean } = {}): Promise<T> {
  const u = metaAppUsage();
  if (u != null && u >= USAGE_GUARD) throw new MetaGraphError(`메타 호출 한도 임박(앱 사용량 ${u}%) — 잠시 후 다시 시도해 주세요.`, 4);
  const body = new URLSearchParams({ access_token: token, locale: "ko_KR" });
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    body.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  if (opts.validateOnly) body.set("execution_options", JSON.stringify(["validate_only"]));
  const res = await fetch(`${G}/${path}`, { method: "POST", body, cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (json.error) {
    const e = json.error as { code?: number; error_subcode?: number; message?: string; error_user_title?: string; error_user_msg?: string };
    // 1885183 = 토큰을 발급한 메타 앱이 개발 모드 → 소재(페이지 게시물)를 못 만듦. 코드로 못 고치고 앱을 '라이브'로 바꿔야 함
    if (e.error_subcode === 1885183) {
      throw new MetaGraphError("메타 앱이 '개발 모드'라 광고 소재를 만들 수 없어요 — developers.facebook.com > 앱 대시보드에서 앱 모드를 '라이브(Live)'로 바꿔야 합니다(개인정보처리방침 URL 필요). 캠페인·광고세트는 이 상태로도 만들어집니다. (코드 100/1885183)", e.code);
    }
    const user = [e.error_user_title, e.error_user_msg].filter(Boolean).join(" — ");
    const err = new MetaGraphError(friendly(e.code, user || e.message || "메타 API 오류") + (e.error_subcode ? ` (코드 ${e.code}/${e.error_subcode})` : e.code ? ` (코드 ${e.code})` : ""), e.code);
    (err as MetaGraphError & { subcode?: number }).subcode = e.error_subcode;
    throw err;
  }
  return json as T;
}

// 단건 조회
export async function graphGet<T = Record<string, unknown>>(path: string, params: Record<string, string>, token: string): Promise<T> {
  return (await getJson(`${G}/${path}?${new URLSearchParams({ ...params, access_token: token })}`)) as T;
}

// 목록·인사이트 — paging.next를 따라 끝까지(안전 상한 maxPages)
export async function graphAll<T = Record<string, unknown>>(path: string, params: Record<string, string>, token: string, maxPages = 30): Promise<T[]> {
  let url: string | undefined = `${G}/${path}?${new URLSearchParams({ limit: "500", ...params, access_token: token })}`;
  const out: T[] = [];
  for (let i = 0; i < maxPages && url; i++) {
    const json = await getJson(url);
    out.push(...((json.data ?? []) as T[]));
    url = json.paging?.next;
  }
  return out;
}

// 배치 API — GET 여러 건을 요청 하나로(최대 50). 항목별 결과 { code, body(JSON 문자열) }
async function batchGet(relativeUrls: string[], token: string): Promise<{ code: number; body: unknown }[]> {
  const u = metaAppUsage();
  if (u != null && u >= USAGE_GUARD) throw new MetaGraphError(`메타 호출 한도 임박(앱 사용량 ${u}%) — 한도를 넘기지 않으려고 조회를 멈췄어요. 잠시 후 다시 시도해 주세요.`, 4);
  const res = await fetch("https://graph.facebook.com", {
    method: "POST",
    body: new URLSearchParams({ access_token: token, include_headers: "false", batch: JSON.stringify(relativeUrls.map((r) => ({ method: "GET", relative_url: r }))) }),
    cache: "no-store",
  });
  const usage = res.headers.get("x-app-usage");
  if (usage) {
    try {
      const j = JSON.parse(usage) as { call_count?: number; total_time?: number; total_cputime?: number };
      lastUsage = { pct: Math.max(j.call_count ?? 0, j.total_time ?? 0, j.total_cputime ?? 0), at: Date.now() };
    } catch {
      /* 무시 */
    }
  }
  const json = await res.json().catch(() => null);
  if (!Array.isArray(json)) {
    const e = (json as { error?: { code?: number; message?: string } } | null)?.error;
    throw new MetaGraphError(friendly(e?.code, e?.message ?? "메타 배치 조회 실패"), e?.code);
  }
  return (json as ({ code: number; body: string } | null)[]).map((r) => {
    if (!r) return { code: 0, body: null };
    try {
      return { code: r.code, body: JSON.parse(r.body) };
    } catch {
      return { code: r.code, body: null };
    }
  });
}

// 여러 객체를 id로 한 번에 — 배치 API 50개씩 병렬(v26에서 ?ids= 폐지). 권한 없는 id 등 항목별 실패는 건너뛰고, 호출 한도 오류만 올린다
export async function graphByIds<T = Record<string, unknown>>(ids: string[], fields: string, token: string, extra: Record<string, string> = {}): Promise<Map<string, T>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const qs = new URLSearchParams({ fields, ...extra }).toString();
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 50) chunks.push(uniq.slice(i, i + 50));
  const out = new Map<string, T>();
  const results = await Promise.all(chunks.map((c) => batchGet(c.map((id) => `${META_API_VERSION}/${id}?${qs}`), token).then((r) => ({ c, r }))));
  for (const { c, r } of results) {
    r.forEach((item, i) => {
      const err = (item.body as { error?: { code?: number; message?: string } } | null)?.error;
      if (item.code === 200 && item.body && !err) out.set(c[i], item.body as T);
      else if (err?.code != null && LIMIT_CODES.has(err.code)) throw new MetaGraphError(friendly(err.code, err.message ?? "메타 호출 한도"), err.code);
    });
  }
  return out;
}

// 예전 이름(일부 id 권한 없음 대비) — 배치는 항목별로 실패를 건너뛰므로 같은 동작
export const graphByIdsTolerant = graphByIds;

type ActionItem = { action_type: string; value: string };
export const PURCHASE_TYPES = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];

export function pickAction(arr: unknown, types: string[]): number {
  if (!Array.isArray(arr)) return 0;
  for (const t of types) {
    const hit = (arr as ActionItem[]).find((a) => a.action_type === t);
    if (hit) return parseFloat(hit.value) || 0;
  }
  return 0;
}

export function num(v: unknown): number {
  const x = parseFloat(String(v ?? "0"));
  return isNaN(x) ? 0 : x;
}

export function actOf(accountId: string) {
  return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
}
