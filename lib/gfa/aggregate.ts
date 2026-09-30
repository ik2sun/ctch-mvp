// GFA 조회 헬퍼 — 계정·목록(캠페인/광고그룹/소재)과 과거 성과(performance/past/{aggregationType})
// 과거 성과는 한 번 호출로 집계 단위 ID(campaignNo·adSetNo·creativeNo)와 일자(targetDate)가 함께 온다 → 계층 합산은 여기서.
// 문서에 조회 기간 상한이 없어 31일 단위로 나눠 부르고, 응답의 next 토큰으로 페이지를 끝까지 넘긴다.

import { gfaRequest } from "./client";
import type { GfaCredentials } from "./auth";

// ---------- 타입 ----------

type Page<T> = { content?: T[]; last?: boolean; totalPages?: number };

export type GfaAdAccount = { no: number; name: string; disabled?: boolean; role?: string };
export type GfaManagerTree = { no: number; name: string; childAdAccountNos?: number[]; childManagerAccounts?: GfaManagerTree[] };
export type GfaCampaign = { no: number; name: string; objective?: string; activated?: boolean; deleted?: boolean };
export type GfaAdSet = { no: number; name: string; campaignNo: number; campaignName?: string; activated?: boolean };
export type GfaCreative = { no: number; name?: string; adSetNo: number; creativeType?: string; activated?: boolean; status?: string };

export type GfaAggregation = "campaigns" | "adSets" | "creatives" | "assetGroups";
export type GfaPerfRow = {
  campaignNo?: number;
  adSetNo?: number;
  creativeNo?: number;
  assetGroupNo?: number;
  targetDate?: string;
  impCount?: number;
  clickCount?: number;
  vplayCount?: number;
  sales?: number;
  convCount?: number;
  convSales?: number;
};

// 대시보드·리포트 공용 정규화 지표(메타·네이버·카카오와 같은 세트). GFA 성과 API에는 도달(reach)이 없다.
export type GfaMetrics = { impressions: number; clicks: number; cost: number; conversions: number; revenue: number; reach: number };
export const EMPTY_GFA_METRICS: GfaMetrics = { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, reach: 0 };

// sales = 광고비(집행 금액)로 본다 — 전환 매출은 convSales로 따로 온다. 첫 실데이터에서 관리자 화면 '총 비용'과 대조할 것.
export function gfaMetricsOf(r: GfaPerfRow): GfaMetrics {
  return {
    impressions: Number(r.impCount) || 0,
    clicks: Number(r.clickCount) || 0,
    cost: Number(r.sales) || 0,
    conversions: Number(r.convCount) || 0,
    revenue: Number(r.convSales) || 0,
    reach: 0,
  };
}

export function addMetrics(a: GfaMetrics, b: GfaMetrics): GfaMetrics {
  return {
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    cost: a.cost + b.cost,
    conversions: a.conversions + b.conversions,
    revenue: a.revenue + b.revenue,
    reach: 0,
  };
}

// ---------- 날짜 ----------

export function shiftDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function shiftMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(since: string, until: string): number {
  return Math.max(1, Math.round((new Date(until).getTime() - new Date(since).getTime()) / 86400000) + 1);
}
function splitRange(since: string, until: string, maxDays = 31): Array<{ since: string; until: string }> {
  const out: Array<{ since: string; until: string }> = [];
  for (let s = since; s <= until; ) {
    const e = shiftDays(s, maxDays - 1);
    out.push({ since: s, until: e < until ? e : until });
    s = shiftDays(e, 1);
  }
  return out;
}

// ---------- 계정 ----------

// 연결한 네이버 아이디가 직접 멤버인 광고계정
export async function fetchMyAdAccounts(accessToken: string): Promise<GfaAdAccount[]> {
  const out: GfaAdAccount[] = [];
  for (let page = 0; page < 20; page++) {
    const p = await gfaRequest<Page<GfaAdAccount>>("/adAccounts", { accessToken, query: { page, size: 100 } });
    out.push(...(p.content ?? []));
    if (p.last !== false) break;
  }
  return out;
}

export async function fetchMyManagerAccounts(accessToken: string): Promise<GfaAdAccount[]> {
  const p = await gfaRequest<Page<GfaAdAccount>>("/managerAccounts", { accessToken, query: { page: 0, size: 100 } });
  return p.content ?? [];
}

// 관리 계정 하위(모든 depth)의 광고계정 번호
export async function fetchManagerChildAdAccounts(accessToken: string, managerAccountNo: string): Promise<{ name: string; adAccountNos: string[] }> {
  const tree = await gfaRequest<GfaManagerTree>(`/managerAccounts/${managerAccountNo}`, { accessToken, managerAccountNo });
  const nos = new Set<string>();
  const walk = (t: GfaManagerTree) => {
    for (const n of t.childAdAccountNos ?? []) nos.add(String(n));
    for (const c of t.childManagerAccounts ?? []) walk(c);
  };
  walk(tree);
  return { name: tree.name, adAccountNos: [...nos] };
}

export function fetchAdAccount(c: GfaCredentials): Promise<GfaAdAccount> {
  return gfaRequest<GfaAdAccount>(`/adAccounts/${c.adAccountNo}`, { accessToken: c.accessToken, managerAccountNo: c.managerAccountNo });
}

// ---------- 목록 ----------

async function allPages<T>(c: GfaCredentials, path: string, query: Record<string, string | number | boolean> = {}, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const p = await gfaRequest<Page<T>>(path, { accessToken: c.accessToken, managerAccountNo: c.managerAccountNo, query: { ...query, page, size: 100 } });
    out.push(...(p.content ?? []));
    if (p.last !== false) break;
  }
  return out;
}

export function fetchCampaigns(c: GfaCredentials, maxPages?: number): Promise<GfaCampaign[]> {
  return allPages<GfaCampaign>(c, `/adAccounts/${c.adAccountNo}/campaigns`, {}, maxPages);
}
export function fetchAdSets(c: GfaCredentials): Promise<GfaAdSet[]> {
  return allPages<GfaAdSet>(c, `/adAccounts/${c.adAccountNo}/adSets`);
}
export function fetchCreatives(c: GfaCredentials): Promise<GfaCreative[]> {
  return allPages<GfaCreative>(c, `/adAccounts/${c.adAccountNo}/creatives`);
}

// ---------- 성과 ----------

export async function fetchPastPerformance(c: GfaCredentials, aggregation: GfaAggregation, since: string, until: string): Promise<GfaPerfRow[]> {
  const rows: GfaPerfRow[] = [];
  for (const r of splitRange(since, until)) {
    let next: string | undefined;
    for (let guard = 0; guard < 50; guard++) {
      const res = await gfaRequest<{ rows?: GfaPerfRow[]; next?: string }>(`/adAccounts/${c.adAccountNo}/performance/past/${aggregation}`, {
        accessToken: c.accessToken,
        managerAccountNo: c.managerAccountNo,
        query: { startDate: r.since, endDate: r.until, timeUnit: "daily", limit: 1000, next },
      });
      rows.push(...(res.rows ?? []));
      next = res.next || undefined;
      if (!next) break;
    }
  }
  return rows;
}

// ---------- 집계 ----------

export function sumRows(rows: GfaPerfRow[]): GfaMetrics {
  return rows.reduce((a, r) => addMetrics(a, gfaMetricsOf(r)), { ...EMPTY_GFA_METRICS });
}

export function groupBy(rows: GfaPerfRow[], key: "campaignNo" | "adSetNo" | "creativeNo"): Map<string, GfaMetrics> {
  const out = new Map<string, GfaMetrics>();
  for (const r of rows) {
    const id = r[key];
    if (id == null) continue;
    out.set(String(id), addMetrics(out.get(String(id)) ?? { ...EMPTY_GFA_METRICS }, gfaMetricsOf(r)));
  }
  return out;
}

export type GfaDailyPoint = { date: string; impressions: number; clicks: number; cost: number; conversions: number; revenue: number };

export function dailyFromRows(rows: GfaPerfRow[], since: string, until: string): GfaDailyPoint[] {
  const byDate = new Map<string, GfaMetrics>();
  for (const r of rows) {
    const d = r.targetDate?.slice(0, 10);
    if (d) byDate.set(d, addMetrics(byDate.get(d) ?? { ...EMPTY_GFA_METRICS }, gfaMetricsOf(r)));
  }
  const out: GfaDailyPoint[] = [];
  for (let d = since; d <= until; d = shiftDays(d, 1)) {
    const m = byDate.get(d) ?? EMPTY_GFA_METRICS;
    out.push({ date: d, impressions: m.impressions, clicks: m.clicks, cost: m.cost, conversions: m.conversions, revenue: m.revenue });
  }
  return out;
}
