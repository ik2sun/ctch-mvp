// 자동 리포트 — 네이버 대용량 보고서 → 디바이스별·키워드 TOP·쇼핑 상품 TOP·원본 시트(서버 전용)
import type { NaverAdCredentials } from "@/lib/naver-ad/auth";
import { naverNames, type NaverDetail, type NaverDetailBase, type NaverDetailRow } from "@/lib/naver-ad/statReport";
import { metricsOf, typeLabel, type NaverSections, type Row } from "./compute";

const ZERO = (): NaverDetailBase => ({ impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 });
const add = (a: NaverDetailBase, b: NaverDetailBase) => {
  a.impressions += b.impressions;
  a.clicks += b.clicks;
  a.cost += b.cost;
  a.conversions += b.conversions;
  a.revenue += b.revenue;
};
const CANDIDATES = 60; // 지표별 상위 몇 개를 이름 조회 후보로(정렬 기준을 바꿔도 맞게)
const SORT_KEYS: (keyof NaverDetailBase)[] = ["cost", "impressions", "clicks", "conversions", "revenue"];

function group(rows: NaverDetailRow[], keyOf: (r: NaverDetailRow) => string | null): Map<string, NaverDetailBase> {
  const m = new Map<string, NaverDetailBase>();
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    const v = m.get(k) ?? ZERO();
    add(v, r);
    m.set(k, v);
  }
  return m;
}
function candidates(m: Map<string, NaverDetailBase>): string[] {
  const s = new Set<string>();
  for (const k of SORT_KEYS) [...m.entries()].sort((a, b) => b[1][k] - a[1][k]).slice(0, CANDIDATES).forEach(([id]) => s.add(id));
  return [...s];
}
// id → 이름으로 바꾸고 같은 이름(같은 키워드·상품이 여러 광고그룹에 있음)은 합친다
function byName(m: Map<string, NaverDetailBase>, ids: string[], names: Map<string, string>, prefix: string): Row[] {
  const out = new Map<string, NaverDetailBase>();
  for (const id of ids) {
    const name = names.get(id) ?? id;
    const v = out.get(name) ?? ZERO();
    add(v, m.get(id)!);
    out.set(name, v);
  }
  return [...out.entries()].map(([name, b]) => ({ key: `${prefix}:${name}`, label: name, media: "naver", cur: metricsOf(b), prev: null }));
}

export async function buildNaverSections(cr: NaverAdCredentials, d: NaverDetail, wantRaw: boolean): Promise<NaverSections> {
  const isShopping = (r: NaverDetailRow) => d.campaigns.get(r.campaignId)?.type === "SHOPPING";
  // 키워드 TOP은 파워링크(WEB_SITE) 캠페인 키워드만 — 브랜드검색 키워드(정액, 클릭이 매우 큼)가 섞이면 순위가 왜곡됨(르무통 실측)
  const isPowerlink = (r: NaverDetailRow) => d.campaigns.get(r.campaignId)?.type === "WEB_SITE";
  // 디바이스별
  const dev = group(d.rows, (r) => r.device);
  const total = ZERO();
  for (const v of dev.values()) add(total, v);
  const device: Row[] = [
    { key: "P", label: "PC", media: "naver", cur: metricsOf(dev.get("P") ?? ZERO()), prev: null },
    { key: "M", label: "모바일", media: "naver", cur: metricsOf(dev.get("M") ?? ZERO()), prev: null },
    { key: "total", label: "합계", media: "naver", cur: metricsOf(total), prev: null },
  ];
  // 키워드·상품 후보(기기별)
  const filters = { all: () => true, P: (r: NaverDetailRow) => r.device === "P", M: (r: NaverDetailRow) => r.device === "M" } as const;
  const kwMaps = Object.fromEntries(Object.entries(filters).map(([k, f]) => [k, group(d.rows.filter((r) => f(r) && isPowerlink(r)), (r) => (r.keywordId && r.keywordId !== "-" ? r.keywordId : null))])) as Record<"all" | "P" | "M", Map<string, NaverDetailBase>>;
  const prMaps = Object.fromEntries(Object.entries(filters).map(([k, f]) => [k, group(d.rows.filter((r) => f(r) && isShopping(r)), (r) => (r.adId && r.adId !== "-" ? r.adId : null))])) as Record<"all" | "P" | "M", Map<string, NaverDetailBase>>;
  const kwIds = { all: candidates(kwMaps.all), P: candidates(kwMaps.P), M: candidates(kwMaps.M) };
  const prIds = { all: candidates(prMaps.all), P: candidates(prMaps.P), M: candidates(prMaps.M) };
  // 원본 시트용 이름(광고비 상위 행의 키워드·소재)
  const rawRows = wantRaw ? d.daily.slice(0, 3000) : [];
  const names = await naverNames(
    cr,
    [...kwIds.all, ...kwIds.P, ...kwIds.M, ...rawRows.map((r) => r.keywordId)],
    [...prIds.all, ...prIds.P, ...prIds.M, ...rawRows.map((r) => r.adId)],
  );
  const raw: (string | number)[][] = wantRaw
    ? [
        ["날짜", "캠페인 유형", "캠페인", "광고그룹", "키워드", "소재·상품", "기기", "노출", "클릭", "광고비", "전환", "매출"],
        ...rawRows
          .sort((a, b) => a.date.localeCompare(b.date) || b.cost - a.cost)
          .map((r) => {
            const c = d.campaigns.get(r.campaignId);
            return [
              r.date,
              typeLabel("naver", c?.type ?? null),
              c?.name ?? r.campaignId,
              d.adgroups.get(r.adgroupId) ?? r.adgroupId,
              r.keywordId === "-" ? "" : names.keywords.get(r.keywordId) ?? r.keywordId,
              r.adId === "-" ? "" : names.ads.get(r.adId) ?? r.adId,
              r.device === "P" ? "PC" : "모바일",
              r.impressions,
              r.clicks,
              Math.round(r.cost),
              Math.round(r.conversions * 10) / 10,
              Math.round(r.revenue),
            ];
          }),
      ]
    : [];
  return {
    device,
    keywords: { all: byName(kwMaps.all, kwIds.all, names.keywords, "kw"), P: byName(kwMaps.P, kwIds.P, names.keywords, "kw"), M: byName(kwMaps.M, kwIds.M, names.keywords, "kw") },
    products: { all: byName(prMaps.all, prIds.all, names.ads, "pr"), P: byName(prMaps.P, prIds.P, names.ads, "pr"), M: byName(prMaps.M, prIds.M, names.ads, "pr") },
    raw,
    missingDays: d.missingDays,
  };
}
