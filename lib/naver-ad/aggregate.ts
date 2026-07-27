import { chunk, naverAdRequest } from "./client";
import type { NaverAdCredentials } from "./auth";
import type { NaverAd, NaverAdGroup, NaverCampaign, NaverStatRaw } from "./types";

export const STAT_FIELDS = [
  "impCnt",
  "clkCnt",
  "salesAmt",
  "ctr",
  "cpc",
  "ccnt",
  "purchaseCcnt",
  "purchaseConvAmt",
] as const;

// /stats의 ids 파라미터는 URL 길이 제한이 있어 대량 id는 나눠서 요청한다.
const STATS_CHUNK_SIZE = 150;

export function fetchAllCampaigns(credentials: NaverAdCredentials): Promise<NaverCampaign[]> {
  return naverAdRequest<NaverCampaign[]>("GET", "/ncc/campaigns", credentials);
}

export function fetchAllAdGroups(
  credentials: NaverAdCredentials,
  campaignId?: string,
): Promise<NaverAdGroup[]> {
  return naverAdRequest<NaverAdGroup[]>(
    "GET",
    "/ncc/adgroups",
    credentials,
    campaignId ? { nccCampaignId: campaignId } : undefined,
  );
}

export function fetchAdsByAdGroup(
  credentials: NaverAdCredentials,
  adgroupId: string,
): Promise<NaverAd[]> {
  return naverAdRequest<NaverAd[]>("GET", "/ncc/ads", credentials, { nccAdgroupId: adgroupId });
}

// 여러 entity(캠페인/광고그룹/광고/키워드) id의 기간 합계 지표를 한 번에 조회.
// entity당 1건이 아니라 ids 배열 전체를 배치로 묶어 호출 수를 최소화한다.
export async function fetchBulkStats(
  credentials: NaverAdCredentials,
  ids: string[],
  since: string,
  until: string,
): Promise<Map<string, NaverStatRaw>> {
  const result = new Map<string, NaverStatRaw>();
  if (ids.length === 0) return result;

  const batches = chunk(ids, STATS_CHUNK_SIZE);
  const responses = await Promise.all(
    batches.map((batch) =>
      naverAdRequest<{ data: NaverStatRaw[] }>("GET", "/stats", credentials, {
        ids: batch.join(","),
        fields: JSON.stringify(STAT_FIELDS),
        timeIncrement: "allDays",
        timeRange: JSON.stringify({ since, until }),
      }),
    ),
  );
  for (const res of responses) {
    for (const row of res.data ?? []) result.set(row.id, row);
  }
  return result;
}

export type NaverDailyStatPoint = {
  date: string;
  impCnt: number;
  clkCnt: number;
  salesAmt: number;
  ccnt: number;
  purchaseConvAmt: number;
};

// 단일 entity의 일별 지표. ids(복수) 파라미터는 daily breakdown을 지원하지 않아
// entity 하나씩 개별 호출해야 한다 — 계정 전체 일별 추이를 만들 때는 상위 N개만 골라 사용할 것.
export async function fetchDailyStatById(
  credentials: NaverAdCredentials,
  id: string,
  since: string,
  until: string,
): Promise<NaverDailyStatPoint[]> {
  const res = await naverAdRequest<{ data: (NaverStatRaw & { dateStart?: string })[] }>(
    "GET",
    "/stats",
    credentials,
    {
      id,
      fields: JSON.stringify(STAT_FIELDS),
      timeIncrement: "1",
      timeRange: JSON.stringify({ since, until }),
    },
  );
  return (res.data ?? []).map((r) => ({
    date: r.dateStart ?? "",
    impCnt: r.impCnt ?? 0,
    clkCnt: r.clkCnt ?? 0,
    salesAmt: r.salesAmt ?? 0,
    ccnt: r.ccnt ?? 0,
    purchaseConvAmt: r.purchaseConvAmt ?? 0,
  }));
}

export type DailyTotal = {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

// 계정/트리 전체의 일별 추이는 entity 단건 조회만 가능해 다 합칠 수 없다.
// 이미 조회한 기간 합계(statMap)에서 지출 상위 N개를 골라 일별 지표를 합산한 근사치를 만든다.
export async function buildApproxDailyTrend(
  credentials: NaverAdCredentials,
  statMap: Map<string, NaverStatRaw>,
  since: string,
  until: string,
  topN = 20,
): Promise<DailyTotal[]> {
  const topIds = [...statMap.entries()]
    .sort((a, b) => (b[1].salesAmt ?? 0) - (a[1].salesAmt ?? 0))
    .slice(0, topN)
    .map(([id]) => id);

  const perEntity = await Promise.all(topIds.map((id) => fetchDailyStatById(credentials, id, since, until)));
  const byDate = new Map<string, DailyTotal>();
  for (const points of perEntity) {
    for (const p of points) {
      if (!p.date) continue;
      const acc = byDate.get(p.date) ?? { date: p.date, impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 };
      acc.impressions += p.impCnt;
      acc.clicks += p.clkCnt;
      acc.cost += p.salesAmt;
      acc.conversions += p.ccnt;
      acc.revenue += p.purchaseConvAmt;
      byDate.set(p.date, acc);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function shiftDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function shiftMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return isoDate(d);
}
