// 자동 리포트 — 캠페인 일별 지표 → 합계·매체별·캠페인별·일별(순수). 수치는 전부 여기서 계산하고 AI는 이 결과만 읽는다
import type { CorrCampaign } from "@/features/correlation/types";
import { MEDIA_LABEL } from "@/features/correlation/types";
import type { Range } from "./period";
import type { MetricKey } from "./types";

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
  byCampaign: Row[]; // 기간 중 실적 있는 캠페인 전부(광고비순) — 표는 섹션 limit으로 자름
  daily: { date: string; m: Metrics }[];
  mediaIncluded: string[];
};

export function computeReport(campaigns: CorrCampaign[], cur: Range, prev: Range | null, mediaFilter: string[] = []): ReportData {
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
  return {
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
