// 메타 Graph API 공용 호출 — 페이지 끝까지 받기, ids 묶음 조회, 인사이트 지표 해석. 서버 전용.
export const META_API_VERSION = "v21.0";
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

// 묶음 조회 중 일부 id만 권한이 없을 때 — 실패한 묶음을 반으로 나눠 다시(전체 1건씩 조회 대신). 한도 오류는 그대로 올린다.
export async function graphByIdsTolerant<T = Record<string, unknown>>(ids: string[], fields: string, token: string, extra: Record<string, string> = {}): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  const run = async (part: string[]): Promise<void> => {
    if (!part.length) return;
    try {
      const m = await graphByIds<T>(part, fields, token, extra);
      m.forEach((v, k) => out.set(k, v));
    } catch (e) {
      if (e instanceof MetaGraphError && e.code != null && LIMIT_CODES.has(e.code)) throw e;
      if (part.length === 1) return; // 이 1건은 권한 없음 — 건너뜀
      const mid = Math.ceil(part.length / 2);
      await run(part.slice(0, mid));
      await run(part.slice(mid));
    }
  };
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 50) await run(uniq.slice(i, i + 50));
  return out;
}

// 여러 객체를 id로 한 번에(?ids=, 50개씩 병렬)
export async function graphByIds<T = Record<string, unknown>>(ids: string[], fields: string, token: string, extra: Record<string, string> = {}): Promise<Map<string, T>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < uniq.length; i += 50) chunks.push(uniq.slice(i, i + 50));
  const out = new Map<string, T>();
  const results = await Promise.all(
    chunks.map((c) => getJson(`${G}/?${new URLSearchParams({ ids: c.join(","), fields, ...extra, access_token: token })}`)),
  );
  for (const r of results) for (const [id, v] of Object.entries(r as Record<string, T>)) out.set(id, v);
  return out;
}

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
