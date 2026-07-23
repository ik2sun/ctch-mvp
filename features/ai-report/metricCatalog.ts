import { derive, type Totals } from "./metaTypes";

export type CompareMetricKey =
  | "cost"
  | "impressions"
  | "clicks"
  | "conversions"
  | "revenue"
  | "reach"
  | "frequency"
  | "ctr"
  | "cpc"
  | "cpa"
  | "cvr"
  | "roas";

export const METRIC_CATALOG: Record<CompareMetricKey, { label: string; kind: "won" | "int" | "pct" | "x" | "dec" }> = {
  cost: { label: "광고비", kind: "won" },
  impressions: { label: "노출수", kind: "int" },
  clicks: { label: "클릭수", kind: "int" },
  conversions: { label: "전환수", kind: "int" },
  revenue: { label: "전환매출", kind: "won" },
  reach: { label: "도달수", kind: "int" },
  frequency: { label: "빈도", kind: "dec" },
  ctr: { label: "CTR", kind: "pct" },
  cpc: { label: "CPC", kind: "won" },
  cpa: { label: "CPA", kind: "won" },
  cvr: { label: "CVR", kind: "pct" },
  roas: { label: "ROAS", kind: "x" },
};

export const DEFAULT_COMPARE_METRICS: CompareMetricKey[] = ["cost", "conversions", "revenue", "roas"];

const DIRECT_KEYS: CompareMetricKey[] = ["cost", "impressions", "clicks", "conversions", "revenue", "reach", "frequency"];

export function metricValue(totals: Totals, key: CompareMetricKey): number {
  if (DIRECT_KEYS.includes(key)) return totals[key as "cost" | "impressions" | "clicks" | "conversions" | "revenue" | "reach" | "frequency"];
  const d = derive(totals);
  return d[key as "ctr" | "cpc" | "cpa" | "cvr" | "roas"] ?? 0;
}

export function hasData(totals: Totals): boolean {
  return totals.impressions !== 0 || totals.clicks !== 0 || totals.cost !== 0 || totals.conversions !== 0 || totals.revenue !== 0;
}
