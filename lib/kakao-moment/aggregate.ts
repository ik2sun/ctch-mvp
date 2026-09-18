// 카카오모먼트 조회 헬퍼 — 목록(광고계정·캠페인·광고그룹·소재)과 보고서(계정/캠페인/광고그룹 레벨)
// 보고서 제약: start/end는 yyyyMMdd, 한 번에 31일 이내, 당일 데이터는 다음날 08:00 전까지 변동.
// 요청 제한이 빡빡하므로(5초/1회) 계정 보고서 한 번으로 캠페인 전체 합계(level=CAMPAIGN)를 받는 식으로 호출 수를 최소화한다.

import type { KakaoCredentials } from "./auth";
import { chunk, kakaoRequest } from "./client";
import {
  addMetrics,
  EMPTY_KAKAO_METRICS,
  kakaoMetricsOf,
  type KakaoAdAccount,
  type KakaoAdGroup,
  type KakaoCampaign,
  type KakaoCreative,
  type KakaoMetrics,
  type KakaoPage,
  type KakaoReportResponse,
  type KakaoReportRow,
} from "./types";

export const METRICS_GROUPS = ["BASIC", "ADDITION", "PIXEL_SDK_CONVERSION"] as const;
const MAX_RANGE_DAYS = 31;

// ---------- 날짜 ----------

export function toYmd(iso: string): string {
  return iso.replace(/-/g, "").slice(0, 8);
}
export function fromYmd(ymd: string): string {
  const s = String(ymd).replace(/-/g, "");
  return s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : String(ymd);
}
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
// 31일 제한을 넘는 기간은 여러 구간으로 나눈다
function splitRange(since: string, until: string): Array<{ since: string; until: string }> {
  const out: Array<{ since: string; until: string }> = [];
  let s = since;
  while (s <= until) {
    const e = shiftDays(s, MAX_RANGE_DAYS - 1);
    out.push({ since: s, until: e < until ? e : until });
    s = shiftDays(e, 1);
  }
  return out;
}

function unwrap<T>(page: KakaoPage<T> | undefined | null): T[] {
  if (!page) return [];
  if (Array.isArray(page)) return page;
  return page.content ?? [];
}

// ---------- 목록 ----------

export async function fetchAdAccounts(accessToken: string): Promise<KakaoAdAccount[]> {
  const page = await kakaoRequest<KakaoPage<KakaoAdAccount>>("/adAccounts/pages", { accessToken, query: { size: 100 }, bucket: "list" });
  return unwrap(page);
}

export async function fetchCampaigns(c: KakaoCredentials): Promise<KakaoCampaign[]> {
  const page = await kakaoRequest<KakaoPage<KakaoCampaign>>("/campaigns", { accessToken: c.accessToken, adAccountId: c.adAccountId, bucket: "list" });
  return unwrap(page).filter((x) => x.config !== "DEL");
}

export async function fetchAdGroups(c: KakaoCredentials, campaignId: number): Promise<KakaoAdGroup[]> {
  const page = await kakaoRequest<KakaoPage<KakaoAdGroup>>("/adGroups", { accessToken: c.accessToken, adAccountId: c.adAccountId, query: { campaignId }, bucket: "list" });
  return unwrap(page)
    .filter((x) => x.config !== "DEL")
    .map((g) => ({ ...g, campaignId: g.campaignId ?? campaignId }));
}

export async function fetchCreatives(c: KakaoCredentials, adGroupId: number): Promise<KakaoCreative[]> {
  const page = await kakaoRequest<KakaoPage<KakaoCreative>>("/creatives", { accessToken: c.accessToken, adAccountId: c.adAccountId, query: { adGroupId }, bucket: "list" });
  return unwrap(page)
    .filter((x) => x.config !== "DEL")
    .map((cr) => ({ ...cr, adGroupId: cr.adGroupId ?? adGroupId }));
}

// ---------- 보고서 ----------

type ReportOpts = { since: string; until: string; timeUnit?: "DAY" | "ALL"; level?: string; dimension?: string };

async function reportRange(c: KakaoCredentials, path: string, idParam: Record<string, unknown>, bucket: "account-report" | "campaign-report" | "adgroup-report", opts: ReportOpts): Promise<KakaoReportRow[]> {
  const rows: KakaoReportRow[] = [];
  for (const r of splitRange(opts.since, opts.until)) {
    const res = await kakaoRequest<KakaoReportResponse>(path, {
      accessToken: c.accessToken,
      adAccountId: c.adAccountId,
      bucket,
      query: {
        ...(idParam as Record<string, string | number | Array<string | number> | undefined>),
        start: toYmd(r.since),
        end: toYmd(r.until),
        timeUnit: opts.timeUnit ?? "ALL",
        level: opts.level,
        dimension: opts.dimension,
        metricsGroup: [...METRICS_GROUPS],
      },
    });
    rows.push(...(res.data ?? []));
  }
  return rows;
}

// 광고계정 보고서 — level=AD_ACCOUNT(계정 합계) 또는 CAMPAIGN(캠페인별 합계). timeUnit=DAY면 일별.
export function fetchAccountReport(c: KakaoCredentials, opts: ReportOpts): Promise<KakaoReportRow[]> {
  return reportRange(c, "/adAccounts/report", { adAccountId: c.adAccountId }, "account-report", { level: "AD_ACCOUNT", ...opts });
}

// 캠페인 보고서 — campaignId 최대 5개, level=CAMPAIGN | AD_GROUP
export async function fetchCampaignReport(c: KakaoCredentials, campaignIds: number[], opts: ReportOpts): Promise<KakaoReportRow[]> {
  const rows: KakaoReportRow[] = [];
  for (const ids of chunk(campaignIds, 5)) {
    rows.push(...(await reportRange(c, "/campaigns/report", { campaignId: ids }, "campaign-report", { level: "CAMPAIGN", ...opts })));
  }
  return rows;
}

// 광고그룹 보고서 — adGroupId 최대 40개, level=AD_GROUP | CREATIVE (1초 제한)
export async function fetchAdGroupReport(c: KakaoCredentials, adGroupIds: number[], opts: ReportOpts): Promise<KakaoReportRow[]> {
  const rows: KakaoReportRow[] = [];
  for (const ids of chunk(adGroupIds, 40)) {
    rows.push(...(await reportRange(c, "/adGroups/report", { adGroupId: ids }, "adgroup-report", { level: "AD_GROUP", ...opts })));
  }
  return rows;
}

// ---------- 집계 ----------

export function sumRows(rows: KakaoReportRow[]): KakaoMetrics {
  return rows.reduce((a, r) => addMetrics(a, kakaoMetricsOf(r)), { ...EMPTY_KAKAO_METRICS });
}

function dimId(row: KakaoReportRow, ...keys: string[]): string | null {
  const d = row.dimensions ?? {};
  for (const k of keys) {
    const v = d[k];
    if (v != null && v !== "") return String(v);
  }
  return null;
}

// 특정 축(캠페인/광고그룹/소재)으로 행을 묶어 합산
export function groupByDimension(rows: KakaoReportRow[], ...keys: string[]): Map<string, KakaoMetrics> {
  const out = new Map<string, KakaoMetrics>();
  for (const r of rows) {
    const id = dimId(r, ...keys);
    if (!id) continue;
    out.set(id, addMetrics(out.get(id) ?? { ...EMPTY_KAKAO_METRICS }, kakaoMetricsOf(r)));
  }
  return out;
}

export type KakaoDailyPoint = { date: string; impressions: number; clicks: number; cost: number; conversions: number; revenue: number };

// timeUnit=DAY 응답을 일별 시계열로 — 날짜 축 키는 start / date / day 중 있는 것을 쓴다
export function dailyFromRows(rows: KakaoReportRow[], since: string, until: string): KakaoDailyPoint[] {
  const byDate = new Map<string, KakaoMetrics>();
  for (const r of rows) {
    const raw = dimId(r, "start", "date", "day", "reportDate");
    if (!raw) continue;
    const date = fromYmd(raw);
    byDate.set(date, addMetrics(byDate.get(date) ?? { ...EMPTY_KAKAO_METRICS }, kakaoMetricsOf(r)));
  }
  const out: KakaoDailyPoint[] = [];
  for (let d = since; d <= until; d = shiftDays(d, 1)) {
    const m = byDate.get(d) ?? EMPTY_KAKAO_METRICS;
    out.push({ date: d, impressions: m.impressions, clicks: m.clicks, cost: m.cost, conversions: m.conversions, revenue: m.revenue });
  }
  return out;
}

export function displayName(cr: KakaoCreative): string {
  return cr.name?.trim() || cr.title?.trim() || cr.description?.trim() || `소재 ${cr.id}`;
}
