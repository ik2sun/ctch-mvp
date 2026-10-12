// 자동 리포트 — 캠페인 일별 지표 → 합계·매체별·캠페인별·일별(순수). 수치는 전부 여기서 계산하고 AI는 이 결과만 읽는다
import type { CorrCampaign } from "@/features/correlation/types";
import { MEDIA_LABEL } from "@/features/correlation/types";
import type { Range } from "./period";
import type { MetricKey } from "./types";

// 네이버 상세 섹션 데이터(store.ts가 대용량 보고서로 채움)
export type NaverSections = {
  device: Row[]; // PC·모바일·합계
  keywords: Record<"all" | "P" | "M", Row[]>; // 키워드(문구 기준) 후보 — 섹션이 정렬·자름
  products: Record<"all" | "P" | "M", Row[]>; // 쇼핑검색 상품 후보
  raw: (string | number)[][]; // 원본 시트(머리글 포함)
  missingDays: string[];
};

export type Base = { cost: number; impressions: number; clicks: number; conversions: number; revenue: number };
export type Metrics = Record<MetricKey, number | null>;

const ZERO: Base = { cost: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 };
const div = (a: number, b: number) => (b > 0 ? a / b : null);

export function metricsOf(b: Base): Metrics {
  return {
    cost: b.cost,
    impressions: b.impressions,
    clicks: b.clicks,
    ctr: div(b.clicks, b.impressions),
    cpc: div(b.cost, b.clicks),
    cpm: b.impressions > 0 ? (b.cost / b.impressions) * 1000 : null,
    conversions: b.conversions,
    cvr: div(b.conversions, b.clicks),
    cpa: div(b.cost, b.conversions),
    revenue: b.revenue,
    roas: div(b.revenue, b.cost),
  };
}

function sumDaily(c: CorrCampaign, r: Range): Base {
  const s = { ...ZERO };
  for (const d of c.daily) {
    if (d.date < r.since || d.date > r.until) continue;
    s.cost += d.cost || 0;
    s.impressions += d.impressions || 0;
    s.clicks += d.clicks || 0;
    s.conversions += d.conversions || 0;
    s.revenue += d.revenue || 0;
  }
  return s;
}
const plus = (a: Base, b: Base): Base => ({ cost: a.cost + b.cost, impressions: a.impressions + b.impressions, clicks: a.clicks + b.clicks, conversions: a.conversions + b.conversions, revenue: a.revenue + b.revenue });
const empty = (b: Base) => !b.cost && !b.impressions && !b.clicks && !b.conversions && !b.revenue;

export type Row = { key: string; label: string; media?: string; cur: Metrics; prev: Metrics | null };
export type ReportData = {
  total: Row;
  byMedia: Row[];
  byType: Row[]; // 캠페인 유형별(네이버 쇼핑검색·파워링크, 메타 판매·트래픽 …)
  weekly: Row[]; // 최근 N주(오래된 주 → 최근 주), prev = 그 전 주
  achievement: { cur: Metrics; prev: Metrics; curRange: Range; prevRange: Range } | null; // 이번 달 누적 vs 지난달 전체
  naver?: NaverSections; // 네이버 상세(대용량 보고서) — 해당 섹션이 있을 때만
  byCampaign: Row[]; // 기간 중 실적 있는 캠페인 전부(광고비순) — 표는 섹션 limit으로 자름
  daily: { date: string; m: Metrics }[];
  mediaIncluded: string[];
};

// 캠페인 유형 이름 — 매체 원본 목표·유형 값 → 한국어
const TYPE_LABEL: Record<string, Record<string, string>> = {
  naver: { WEB_SITE: "파워링크", SHOPPING: "쇼핑검색", BRAND_SEARCH: "브랜드검색", POWER_CONTENTS: "파워콘텐츠", PLACE: "플레이스", CATALOG: "카탈로그" },
  meta: { OUTCOME_SALES: "판매", OUTCOME_TRAFFIC: "트래픽", OUTCOME_AWARENESS: "인지도", OUTCOME_ENGAGEMENT: "참여", OUTCOME_LEADS: "리드", OUTCOME_APP_PROMOTION: "앱 홍보" },
  gfa: { CONVERSION: "전환", WEB_SITE_TRAFFIC: "웹사이트 트래픽", ENGAGEMENT: "참여", VIDEO_VIEW: "동영상 조회", REACH: "도달", APP_INSTALL: "앱 설치", CATALOG: "카탈로그", SHOPPING: "쇼핑" },
  google_ads: { SEARCH: "검색", PERFORMANCE_MAX: "실적 최대화", DEMAND_GEN: "디맨드젠", VIDEO: "동영상", DISPLAY: "디스플레이", SHOPPING: "쇼핑" },
};
export function typeLabel(media: string, objective: string | null): string {
  const raw = String(objective ?? "").split("/")[0];
  return TYPE_LABEL[media]?.[raw] ?? (raw || "기타");
}

const addDays = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
// 이번 달 1일~기준일 / 지난달 전체
export function monthRanges(until: string): { cur: Range; prev: Range } {
  const d = new Date(`${until}T00:00:00Z`);
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const pFirst = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const pLast = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { cur: { since: iso(first), until }, prev: { since: iso(pFirst), until: iso(pLast) } };
}
// 최근 N주(7일 단위, 기준일에서 거꾸로) + 그 전 1주(첫 주의 비교용)
export function weekRanges(until: string, weeks: number): Range[] {
  const out: Range[] = [];
  for (let i = weeks; i >= 0; i--) out.push({ since: addDays(until, -7 * i - 6), until: addDays(until, -7 * i) });
  return out; // [비교용 전 주, 1주차 … N주차]
}
// 리포트에 필요한 가장 이른 날짜(주차별·달성률 섹션까지 고려)
export function earliestNeeded(cur: Range, prev: Range | null, opts: { weeks?: number; achievement?: boolean }): string {
  const c = [cur.since, prev?.since ?? cur.since];
  if (opts.weeks) c.push(weekRanges(cur.until, opts.weeks)[0].since);
  if (opts.achievement) c.push(monthRanges(cur.until).prev.since);
  return c.sort()[0];
}

export function computeReport(campaigns: CorrCampaign[], cur: Range, prev: Range | null, mediaFilter: string[] = [], opts: { weeks?: number; achievement?: boolean } = {}): ReportData {
  const list = mediaFilter.length ? campaigns.filter((c) => mediaFilter.includes(c.media)) : campaigns;
  let tc = { ...ZERO };
  let tp = { ...ZERO };
  const media = new Map<string, { c: Base; p: Base }>();
  const camps: { c: CorrCampaign; cur: Base; prev: Base }[] = [];
  for (const c of list) {
    const a = sumDaily(c, cur);
    const b = prev ? sumDaily(c, prev) : { ...ZERO };
    tc = plus(tc, a);
    tp = plus(tp, b);
    const m = media.get(c.media) ?? { c: { ...ZERO }, p: { ...ZERO } };
    m.c = plus(m.c, a);
    m.p = plus(m.p, b);
    media.set(c.media, m);
    if (!empty(a)) camps.push({ c, cur: a, prev: b });
  }
  const days: { date: string; m: Metrics }[] = [];
  for (let d = cur.since; d <= cur.until; ) {
    const s = { ...ZERO };
    for (const c of list) for (const x of c.daily) if (x.date === d) {
      s.cost += x.cost || 0;
      s.impressions += x.impressions || 0;
      s.clicks += x.clicks || 0;
      s.conversions += x.conversions || 0;
      s.revenue += x.revenue || 0;
    }
    days.push({ date: d, m: metricsOf(s) });
    const n = new Date(`${d}T00:00:00Z`);
    n.setUTCDate(n.getUTCDate() + 1);
    d = n.toISOString().slice(0, 10);
  }
  // 캠페인 유형별 — 매체가 하나면 유형 이름만, 여럿이면 '매체 유형'
  const oneMedia = new Set(list.map((c) => c.media)).size <= 1;
  const types = new Map<string, { label: string; media: string; c: Base; p: Base }>();
  for (const c of list) {
    const t = typeLabel(c.media, c.objective);
    const k = `${c.media}|${t}`;
    const v = types.get(k) ?? { label: oneMedia ? t : `${MEDIA_LABEL[c.media] ?? c.media} ${t}`, media: c.media, c: { ...ZERO }, p: { ...ZERO } };
    v.c = plus(v.c, sumDaily(c, cur));
    if (prev) v.p = plus(v.p, sumDaily(c, prev));
    types.set(k, v);
  }
  // 주차별 — 주마다 전체 합, prev = 바로 전 주
  const weekly: Row[] = [];
  if (opts.weeks) {
    const ws = weekRanges(cur.until, opts.weeks);
    const sums = ws.map((r) => list.reduce((s, c) => plus(s, sumDaily(c, r)), { ...ZERO }));
    for (let i = 1; i < ws.length; i++) {
      const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
      weekly.push({ key: `w${i}`, label: `${md(ws[i].since)}~${md(ws[i].until)}`, cur: metricsOf(sums[i]), prev: metricsOf(sums[i - 1]) });
    }
  }
  let achievement: ReportData["achievement"] = null;
  if (opts.achievement) {
    const m = monthRanges(cur.until);
    achievement = {
      cur: metricsOf(list.reduce((s, c) => plus(s, sumDaily(c, m.cur)), { ...ZERO })),
      prev: metricsOf(list.reduce((s, c) => plus(s, sumDaily(c, m.prev)), { ...ZERO })),
      curRange: m.cur,
      prevRange: m.prev,
    };
  }
  return {
    byType: [...types.values()]
      .filter((v) => !empty(v.c) || !empty(v.p))
      .sort((a, b) => b.c.cost - a.c.cost)
      .map((v) => ({ key: `t:${v.label}`, label: v.label, media: v.media, cur: metricsOf(v.c), prev: prev ? metricsOf(v.p) : null })),
    weekly,
    achievement,
    total: { key: "total", label: "전체", cur: metricsOf(tc), prev: prev ? metricsOf(tp) : null },
    byMedia: [...media.entries()]
      .filter(([, v]) => !empty(v.c) || !empty(v.p))
      .sort((a, b) => b[1].c.cost - a[1].c.cost)
      .map(([k, v]) => ({ key: k, label: MEDIA_LABEL[k] ?? k, media: k, cur: metricsOf(v.c), prev: prev ? metricsOf(v.p) : null })),
    byCampaign: camps
      .sort((a, b) => b.cur.cost - a.cur.cost)
      .map((x) => ({ key: x.c.id, label: x.c.name, media: x.c.media, cur: metricsOf(x.cur), prev: prev ? metricsOf(x.prev) : null })),
    daily: days,
    mediaIncluded: [...media.keys()],
  };
}

// 증감률(비교 값이 0·없음이면 null)
export function change(cur: number | null, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}
