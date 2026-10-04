// 구글 Ads 조회 헬퍼 — GAQL로 캠페인 일별 / 광고그룹·광고 기간 합계 / 계정 정보·MCC 하위 계정.
// 지표 매핑: cost_micros÷1,000,000 → 광고비(계정 통화), conversions → 전환, conversions_value → 매출(전환 가치), 도달은 없음.
// 실적 최대화(PMax)·디맨드젠 일부는 ad_group이 없어 캠페인 행에만 잡힌다(GFA 애셋 그룹과 같은 처리).
import { gadsSearch } from "./client";
import type { GoogleAdsCredentials } from "./auth";

export type GadsMetrics = { impressions: number; clicks: number; cost: number; conversions: number; revenue: number; reach: number };
export const EMPTY_GADS_METRICS: GadsMetrics = { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, reach: 0 };
export type GadsDailyPoint = { date: string; impressions: number; clicks: number; cost: number; conversions: number; revenue: number };

type RawMetrics = { impressions?: string; clicks?: string; costMicros?: string; conversions?: number; conversionsValue?: number };
type Row = {
  campaign?: { id?: string; name?: string; advertisingChannelType?: string };
  adGroup?: { id?: string; name?: string };
  adGroupAd?: { ad?: { id?: string; name?: string; type?: string } };
  segments?: { date?: string };
  metrics?: RawMetrics;
};

export function metricsOf(m: RawMetrics | undefined): GadsMetrics {
  return {
    impressions: Number(m?.impressions) || 0,
    clicks: Number(m?.clicks) || 0,
    cost: (Number(m?.costMicros) || 0) / 1_000_000,
    conversions: Number(m?.conversions) || 0,
    revenue: Number(m?.conversionsValue) || 0,
    reach: 0,
  };
}

export function addMetrics(a: GadsMetrics, b: GadsMetrics): GadsMetrics {
  return { impressions: a.impressions + b.impressions, clicks: a.clicks + b.clicks, cost: a.cost + b.cost, conversions: a.conversions + b.conversions, revenue: a.revenue + b.revenue, reach: 0 };
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

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function range(since: string, until: string) {
  if (!ISO.test(since) || !ISO.test(until)) throw new Error("날짜 형식은 YYYY-MM-DD예요.");
  return `segments.date BETWEEN '${since}' AND '${until}'`;
}
const METRICS = "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value";

// ---------- 조회 ----------

export type GadsCampaignDay = { campaignId: string; campaignName: string; channelType: string; date: string } & GadsMetrics;

export async function fetchCampaignDaily(c: GoogleAdsCredentials, since: string, until: string): Promise<GadsCampaignDay[]> {
  const rows = await gadsSearch<Row>(
    c,
    `SELECT campaign.id, campaign.name, campaign.advertising_channel_type, segments.date, ${METRICS} FROM campaign WHERE ${range(since, until)}`,
  );
  return rows.map((r) => ({
    campaignId: String(r.campaign?.id ?? ""),
    campaignName: r.campaign?.name ?? "",
    channelType: r.campaign?.advertisingChannelType ?? "",
    date: r.segments?.date ?? "",
    ...metricsOf(r.metrics),
  }));
}

export type GadsAdGroupTotal = { adGroupId: string; adGroupName: string; campaignId: string; campaignName: string } & GadsMetrics;

export async function fetchAdGroupTotals(c: GoogleAdsCredentials, since: string, until: string): Promise<GadsAdGroupTotal[]> {
  const rows = await gadsSearch<Row>(c, `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ${METRICS} FROM ad_group WHERE ${range(since, until)}`);
  return rows.map((r) => ({
    adGroupId: String(r.adGroup?.id ?? ""),
    adGroupName: r.adGroup?.name ?? "",
    campaignId: String(r.campaign?.id ?? ""),
    campaignName: r.campaign?.name ?? "",
    ...metricsOf(r.metrics),
  }));
}

export type GadsAdTotal = { adId: string; adName: string; adType: string; adGroupId: string; adGroupName: string; campaignId: string; campaignName: string } & GadsMetrics;

export async function fetchAdTotals(c: GoogleAdsCredentials, since: string, until: string): Promise<GadsAdTotal[]> {
  const rows = await gadsSearch<Row>(
    c,
    `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.ad.type, ${METRICS} FROM ad_group_ad WHERE ${range(since, until)}`,
  );
  return rows.map((r) => ({
    adId: String(r.adGroupAd?.ad?.id ?? ""),
    adName: r.adGroupAd?.ad?.name ?? "",
    adType: r.adGroupAd?.ad?.type ?? "",
    adGroupId: String(r.adGroup?.id ?? ""),
    adGroupName: r.adGroup?.name ?? "",
    campaignId: String(r.campaign?.id ?? ""),
    campaignName: r.campaign?.name ?? "",
    ...metricsOf(r.metrics),
  }));
}

export function sumMetrics(rows: GadsMetrics[]): GadsMetrics {
  return rows.reduce((a, r) => addMetrics(a, r), { ...EMPTY_GADS_METRICS });
}

export function dailyFromCampaignDays(rows: GadsCampaignDay[], since: string, until: string): GadsDailyPoint[] {
  const byDate = new Map<string, GadsMetrics>();
  for (const r of rows) if (r.date) byDate.set(r.date, addMetrics(byDate.get(r.date) ?? { ...EMPTY_GADS_METRICS }, r));
  const out: GadsDailyPoint[] = [];
  for (let d = since; d <= until; d = shiftDays(d, 1)) {
    const m = byDate.get(d) ?? EMPTY_GADS_METRICS;
    out.push({ date: d, impressions: m.impressions, clicks: m.clicks, cost: m.cost, conversions: m.conversions, revenue: m.revenue });
  }
  return out;
}

// 계정 정보 + 활성 캠페인 수(연결 점검용, 2회 호출)
export async function probeCustomer(c: GoogleAdsCredentials, customerId = c.customerId) {
  const info = await gadsSearch<{ customer?: { descriptiveName?: string; currencyCode?: string; manager?: boolean } }>(
    c,
    "SELECT customer.descriptive_name, customer.currency_code, customer.manager FROM customer LIMIT 1",
    customerId,
  );
  const cust = info[0]?.customer ?? {};
  const campaigns = cust.manager ? [] : await gadsSearch(c, "SELECT campaign.id FROM campaign WHERE campaign.status = 'ENABLED'", customerId);
  return { name: cust.descriptiveName ?? "", currency: cust.currencyCode ?? "", manager: !!cust.manager, campaigns: campaigns.length };
}

// MCC 하위 광고계정(관리자 계정 제외) — 공용 키 화면의 광고주별 접근 점검용
export async function fetchMccChildren(c: GoogleAdsCredentials, mccId: string): Promise<{ id: string; name: string }[]> {
  const rows = await gadsSearch<{ customerClient?: { id?: string; descriptiveName?: string; manager?: boolean } }>(
    c,
    "SELECT customer_client.id, customer_client.descriptive_name, customer_client.manager FROM customer_client WHERE customer_client.level <= 5",
    mccId,
  );
  return rows.filter((r) => !r.customerClient?.manager).map((r) => ({ id: String(r.customerClient?.id ?? ""), name: r.customerClient?.descriptiveName ?? "" }));
}
