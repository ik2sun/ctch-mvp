import type { MetricSummary } from "./calcMetrics";

export type DailyPoint = {
  date: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

export type Totals = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

export type MetaLevel = "campaign" | "adset" | "ad";

export type MetaRow = {
  id: string;
  level: MetaLevel;
  name: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  impressions: number;
  clicks: number;
  cost: number;
  reach: number;
  frequency: number;
  conversions: number;
  revenue: number;
  daily?: DailyPoint[];
};

export type MetaHierarchy = {
  campaigns: MetaRow[];
  adsets: MetaRow[];
  ads: MetaRow[];
  daily: DailyPoint[];
  clientName?: string;
  period?: { since: string; until: string };
  compare?: { previous: Totals; lastMonth: Totals };
};

// ── AI 스마트 진단 ──────────────────────────────
export type SmartTag = "scale" | "risk" | "fatigue" | "monitor";

export type SmartStatus = {
  id: string;
  name: string;
  level: MetaLevel;
  tag: SmartTag;
  reason: string;
};

export type SmartInsights = {
  statuses: SmartStatus[];
  trendSummary: string;
  bottleneck: { path: string[]; explanation: string; action: string } | null;
  mermaid: string;
};

export const TAG_META: Record<
  SmartTag,
  { emoji: string; label: string; cls: string }
> = {
  scale: { emoji: "🔥", label: "스케일업", cls: "bg-good/10 text-good border-good/25" },
  risk: { emoji: "🚨", label: "위험", cls: "bg-bad/10 text-bad border-bad/25" },
  fatigue: { emoji: "💤", label: "피로도", cls: "bg-warn/10 text-warn border-warn/25" },
  monitor: { emoji: "🔍", label: "모니터링", cls: "bg-canvas text-ink-muted border-line" },
};

export function derive(r: {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
}) {
  return {
    ctr: r.impressions ? r.clicks / r.impressions : null,
    cpc: r.clicks ? r.cost / r.clicks : null,
    cpa: r.conversions ? r.cost / r.conversions : null,
    cvr: r.clicks ? r.conversions / r.clicks : null,
    roas: r.cost ? r.revenue / r.cost : null,
  };
}

export function metaRowsToSummary(rows: MetaRow[]): MetricSummary {
  const totals = rows.reduce(
    (a, r) => ({
      impressions: a.impressions + r.impressions,
      clicks: a.clicks + r.clicks,
      cost: a.cost + r.cost,
      conversions: a.conversions + r.conversions,
      revenue: a.revenue + r.revenue,
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 },
  );
  const keys = ["impressions", "clicks", "cost", "conversions", "revenue"] as const;
  return {
    mode: "flat",
    rowCount: rows.length,
    totals,
    derived: derive(totals),
    found: keys.filter((k) => totals[k] !== 0),
    missing: keys.filter((k) => totals[k] === 0),
  };
}
