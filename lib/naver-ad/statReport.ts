// 네이버 검색광고 대용량 보고서(StatReport) — 키워드·소재(상품)·기기(PC/모바일) 단위 성과. 서버 전용.
// 날짜마다 AD_DETAIL(노출·클릭·광고비) + AD_CONVERSION_DETAIL(전환·매출) 보고서를 만들고(statDt = 한국 날짜 0시),
// 다 만들어지면 TSV를 내려받아 기간 합계로 묶는다. 2026-10-12 르무통 하루치 실측: AD_DETAIL 12.6만 행·전환 1,244행.
// 열(공식 문서 기준, 실데이터로 위치 확인): 0 날짜 · 2 캠페인 · 3 광고그룹 · 4 키워드(쇼핑은 '-') · 5 소재 · 10 기기(P/M)
//   AD_DETAIL 11 노출 · 12 클릭 · 13 광고비 / AD_CONVERSION_DETAIL 13 전환 수 · 14 전환 매출 · 12 전환 유형(purchase 등)
// 전환 기준은 캠페인 집계(/stats ccnt·purchaseConvAmt)와 맞춘다: 전환 = 모든 유형 합, 매출 = purchase 유형 매출
import { naverAdRequest, chunk } from "./client";
import { buildNaverAdHeaders, type NaverAdCredentials } from "./auth";

export type NaverDetailBase = { impressions: number; clicks: number; cost: number; conversions: number; revenue: number };
export type NaverDetailRow = NaverDetailBase & { campaignId: string; adgroupId: string; keywordId: string; adId: string; device: "P" | "M" };
export type NaverDetailDaily = NaverDetailRow & { date: string };
export type NaverDetail = {
  rows: NaverDetailRow[]; // 기간 합계(캠페인·광고그룹·키워드·소재·기기 단위)
  daily: NaverDetailDaily[]; // 일별(원본 시트용, 광고비 상위만)
  campaigns: Map<string, { name: string; type: string }>;
  adgroups: Map<string, string>;
  missingDays: string[]; // 보고서가 비었거나 실패한 날
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ZERO = (): NaverDetailBase => ({ impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 });
const DAILY_LIMIT = 5000;

function days(since: string, until: string): string[] {
  const out: string[] = [];
  for (let d = since; d <= until; ) {
    out.push(d);
    const n = new Date(`${d}T00:00:00Z`);
    n.setUTCDate(n.getUTCDate() + 1);
    d = n.toISOString().slice(0, 10);
  }
  return out;
}

type Job = { id: number; date: string; tp: "AD_DETAIL" | "AD_CONVERSION_DETAIL" };

async function download(cr: NaverAdCredentials, url: string): Promise<string> {
  const res = await fetch(url, { headers: buildNaverAdHeaders("GET", "/report-download", cr), cache: "no-store" });
  if (!res.ok) throw new Error(`네이버 보고서 내려받기 실패(HTTP ${res.status})`);
  return res.text();
}

export async function fetchNaverDetail(cr: NaverAdCredentials, since: string, until: string, opts: { deadlineMs?: number } = {}): Promise<NaverDetail> {
  const deadline = Date.now() + (opts.deadlineMs ?? 150_000);
  const dates = days(since, until);
  // 1) 보고서 요청(날짜 × 2종) — 네이버 요청 대기열(1초 간격)을 타므로 순서대로
  const jobs: Job[] = [];
  for (const date of dates) {
    for (const tp of ["AD_DETAIL", "AD_CONVERSION_DETAIL"] as const) {
      const r = await naverAdRequest<{ reportJobId: number }>("POST", "/stat-reports", cr, undefined, { reportTp: tp, statDt: `${date}T00:00:00.000Z` });
      jobs.push({ id: r.reportJobId, date, tp });
    }
  }
  // 이름표는 보고서가 만들어지는 동안
  const [camps, groups] = await Promise.all([
    naverAdRequest<{ nccCampaignId: string; name: string; campaignTp: string }[]>("GET", "/ncc/campaigns", cr),
    naverAdRequest<{ nccAdgroupId: string; name: string }[]>("GET", "/ncc/adgroups", cr),
  ]);
  // 2) 다 만들어질 때까지 확인(BUILT·NONE·ERROR)
  const done = new Map<number, { status: string; url: string }>();
  while (done.size < jobs.length && Date.now() < deadline) {
    for (const j of jobs) {
      if (done.has(j.id)) continue;
      const r = await naverAdRequest<{ status: string; downloadUrl: string }>("GET", `/stat-reports/${j.id}`, cr);
      if (["BUILT", "NONE", "ERROR", "AGGREGATING_FAILED"].includes(r.status)) done.set(j.id, { status: r.status, url: r.downloadUrl });
    }
    if (done.size < jobs.length) await sleep(2000);
  }
  // 3) 내려받아 묶기
  const agg = new Map<string, NaverDetailRow>();
  const dailyAgg = new Map<string, NaverDetailDaily>();
  const missing = new Set<string>();
  const key = (c: string[]) => `${c[2]}|${c[3]}|${c[4]}|${c[5]}|${c[10] === "P" ? "P" : "M"}`;
  const row = (c: string[]): NaverDetailRow => ({ campaignId: c[2], adgroupId: c[3], keywordId: c[4], adId: c[5], device: c[10] === "P" ? "P" : "M", ...ZERO() });
  for (const j of jobs) {
    const d = done.get(j.id);
    if (!d || d.status !== "BUILT" || !d.url) {
      if (j.tp === "AD_DETAIL" && d?.status !== "NONE") missing.add(j.date);
      continue;
    }
    const text = await download(cr, d.url);
    for (const line of text.split("\n")) {
      if (!line) continue;
      const c = line.split("\t");
      if (c.length < 14) continue;
      const k = key(c);
      const a = agg.get(k) ?? row(c);
      const dk = `${j.date}|${k}`;
      const b = dailyAgg.get(dk) ?? { ...row(c), date: j.date };
      if (j.tp === "AD_DETAIL") {
        const imp = Number(c[11]) || 0;
        const clk = Number(c[12]) || 0;
        const cost = Number(c[13]) || 0;
        a.impressions += imp;
        a.clicks += clk;
        a.cost += cost;
        b.impressions += imp;
        b.clicks += clk;
        b.cost += cost;
      } else {
        const cnt = Number(c[13]) || 0;
        const sales = c[12] === "purchase" ? Number(c[14]) || 0 : 0;
        a.conversions += cnt;
        a.revenue += sales;
        b.conversions += cnt;
        b.revenue += sales;
      }
      agg.set(k, a);
      dailyAgg.set(dk, b);
    }
  }
  if (done.size < jobs.length) for (const j of jobs) if (!done.has(j.id)) missing.add(j.date);
  const daily = [...dailyAgg.values()]
    .filter((r) => r.impressions || r.clicks || r.cost || r.conversions)
    .sort((a, b) => b.cost - a.cost || b.impressions - a.impressions)
    .slice(0, DAILY_LIMIT);
  return {
    rows: [...agg.values()].filter((r) => r.impressions || r.clicks || r.cost || r.conversions),
    daily,
    campaigns: new Map(camps.map((c) => [c.nccCampaignId, { name: c.name, type: c.campaignTp }])),
    adgroups: new Map(groups.map((g) => [g.nccAdgroupId, g.name])),
    missingDays: [...missing].sort(),
  };
}

// 키워드·소재 이름(필요한 id만, 100개씩) — 쇼핑 상품은 referenceData.productTitle
export async function naverNames(cr: NaverAdCredentials, keywordIds: string[], adIds: string[]): Promise<{ keywords: Map<string, string>; ads: Map<string, string> }> {
  const keywords = new Map<string, string>();
  const ads = new Map<string, string>();
  for (const ids of chunk([...new Set(keywordIds)].filter((x) => x && x !== "-"), 100)) {
    const r = await naverAdRequest<{ nccKeywordId: string; keyword: string }[]>("GET", "/ncc/keywords", cr, { ids: ids.join(",") }).catch(() => []);
    for (const k of r) keywords.set(k.nccKeywordId, k.keyword);
  }
  for (const ids of chunk([...new Set(adIds)].filter((x) => x && x !== "-"), 100)) {
    const r = await naverAdRequest<{ nccAdId: string; type: string; referenceData?: { productTitle?: string; productName?: string }; ad?: { headline?: string; title?: string } }[]>("GET", "/ncc/ads", cr, { ids: ids.join(",") }).catch(() => []);
    for (const a of r) ads.set(a.nccAdId, a.referenceData?.productTitle ?? a.referenceData?.productName ?? a.ad?.headline ?? a.ad?.title ?? a.type);
  }
  return { keywords, ads };
}
