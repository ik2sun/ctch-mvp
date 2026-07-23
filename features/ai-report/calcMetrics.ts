// 매체 리포트 지표 계산 — flat + pivot 자동 감지 + 광고주 템플릿(라벨 override) 우선 적용

export type MetricKey =
  | "impressions"
  | "clicks"
  | "cost"
  | "conversions"
  | "revenue";

export const METRIC_LABELS_KO: Record<MetricKey, string> = {
  impressions: "노출수",
  clicks: "클릭수",
  cost: "광고비",
  conversions: "전환수",
  revenue: "전환매출",
};

const COLUMN_ALIASES: Record<MetricKey, string[]> = {
  impressions: ["노출", "노출수", "impression", "impressions", "imp", "노출량"],
  clicks: ["클릭", "클릭수", "click", "clicks", "유효클릭"],
  cost: ["비용", "광고비", "cost", "spend", "소진금액", "소진액", "집행금액", "광고비용"],
  conversions: ["전환", "전환수", "conversion", "conversions", "conv", "주문수", "구매수", "구매", "가입", "방문"],
  revenue: ["전환매출", "매출", "매출액", "revenue", "전환매출액", "구매금액", "주문금액", "수익"],
};

const PIVOT_LABELS: { label: string; metric: MetricKey }[] = [
  { label: "노출", metric: "impressions" },
  { label: "노출수", metric: "impressions" },
  { label: "클릭", metric: "clicks" },
  { label: "클릭수", metric: "clicks" },
  { label: "구매", metric: "conversions" },
  { label: "전환", metric: "conversions" },
  { label: "전환수", metric: "conversions" },
  { label: "주문수", metric: "conversions" },
  { label: "매출", metric: "revenue" },
  { label: "전환매출", metric: "revenue" },
  { label: "매출액", metric: "revenue" },
  { label: "비용", metric: "cost" },
  { label: "비용(vat-)", metric: "cost" },
  { label: "비용(vat+)", metric: "cost" },
  { label: "광고비", metric: "cost" },
  { label: "소진액", metric: "cost" },
];

// 광고주 템플릿: 지표 → 그 광고주가 쓰는 라벨
export type LabelMap = Partial<Record<MetricKey, string>>;

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/\s/g, "").trim();
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const cleaned = String(v).replace(/[₩,%\s"]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

export type MetricSummary = {
  mode: "flat" | "pivot";
  rowCount: number;
  totals: Record<MetricKey, number>;
  derived: {
    ctr: number | null;
    cpc: number | null;
    cpa: number | null;
    cvr: number | null;
    roas: number | null;
  };
  found: MetricKey[];
  missing: MetricKey[];
};

const EMPTY_TOTALS = (): Record<MetricKey, number> => ({
  impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0,
});

function withDerived(
  mode: "flat" | "pivot",
  totals: Record<MetricKey, number>,
  rowCount: number,
): MetricSummary {
  const found = (Object.keys(totals) as MetricKey[]).filter((k) => totals[k] !== 0);
  const missing = (Object.keys(totals) as MetricKey[]).filter((k) => totals[k] === 0);
  return {
    mode,
    rowCount,
    totals,
    derived: {
      ctr: totals.impressions ? totals.clicks / totals.impressions : null,
      cpc: totals.clicks ? totals.cost / totals.clicks : null,
      cpa: totals.conversions ? totals.cost / totals.conversions : null,
      cvr: totals.clicks ? totals.conversions / totals.clicks : null,
      roas: totals.cost ? totals.revenue / totals.cost : null,
    },
    found,
    missing,
  };
}

function tokenize(h: string): string[] {
  return norm(h).split(/[_()/\s.\-]+/).filter(Boolean);
}

// 지표에 가장 잘 맞는 컬럼 인덱스 찾기 (토큰 정확일치 우선, 가장 '순수한' 헤더 선택)
function bestColumn(headers: string[], aliases: string[], override?: string): number {
  // 1) 템플릿 라벨 우선 (정확 일치)
  if (override) {
    const idx = headers.findIndex((h) => norm(h) === norm(override));
    if (idx >= 0) return idx;
  }
  // 2) 토큰 정확 일치 — 토큰 수가 가장 적은(가장 순수한) 헤더 우선
  let best = -1;
  let bestScore = Infinity;
  headers.forEach((h, i) => {
    const toks = tokenize(h);
    if (toks.some((t) => aliases.includes(t)) && toks.length < bestScore) {
      bestScore = toks.length;
      best = i;
    }
  });
  if (best >= 0) return best;
  // 3) 마지막 수단: 부분 포함 매칭 (기존 동작)
  for (const alias of aliases) {
    const idx = headers.findIndex((h) => {
      const n = norm(h).replace(/\(.*?\)/g, "");
      return n === alias || n.includes(alias);
    });
    if (idx >= 0) return idx;
  }
  return -1;
}

function analyzeFlat(grid: unknown[][], override?: LabelMap): MetricSummary {
  const totals = EMPTY_TOTALS();
  if (grid.length < 2) return withDerived("flat", totals, 0);
  const headers = grid[0].map((h) => String(h ?? ""));
  const data = grid.slice(1);

  (Object.keys(totals) as MetricKey[]).forEach((metric) => {
    const idx = bestColumn(headers, COLUMN_ALIASES[metric], override?.[metric]);
    if (idx >= 0) totals[metric] = data.reduce((s, r) => s + num(r[idx]), 0);
  });
  return withDerived("flat", totals, data.length);
}

function analyzePivot(grid: unknown[][], override?: LabelMap): MetricSummary {
  const totals = EMPTY_TOTALS();
  let blocks = 0;

  // 유효 라벨맵 = 기본 + 템플릿(override 우선)
  const labelToMetric = new Map<string, MetricKey>();
  for (const p of PIVOT_LABELS) labelToMetric.set(p.label, p.metric);
  if (override) {
    (Object.keys(override) as MetricKey[]).forEach((m) => {
      const lbl = override[m];
      if (lbl) labelToMetric.set(norm(lbl), m);
    });
  }

  for (const row of grid) {
    for (let i = 0; i < row.length; i++) {
      const metric = labelToMetric.get(norm(row[i]));
      if (metric) {
        const rightSum = row.slice(i + 1).reduce((s: number, x) => s + num(x), 0);
        totals[metric] += rightSum;
        if (metric === "impressions") blocks++;
        break;
      }
    }
  }
  return withDerived("pivot", totals, blocks);
}

export function analyzeGrid(grid: unknown[][], override?: LabelMap): MetricSummary {
  const flat = analyzeFlat(grid, override);
  const pivot = analyzePivot(grid, override);
  if (pivot.found.length > flat.found.length) return pivot;
  return flat;
}

// 파일에서 라벨/헤더 후보 추출 (매핑 UI 드롭다운용)
// 숫자가 아닌, 적당한 길이의 문자열 셀을 중복 제거해 반환
export function extractLabels(grid: unknown[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of grid) {
    for (const cell of row) {
      const s = String(cell ?? "").trim();
      if (!s) continue;
      if (s.length > 30) continue;              // 너무 긴 건 데이터/설명
      if (/^[0-9₩,.\-%\s]+$/.test(s)) continue; // 순수 숫자 제외
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out.slice(0, 300);
}

export function fmt(n: number | null, kind: "int" | "won" | "pct" | "x" | "dec"): string {
  if (n == null) return "—";
  switch (kind) {
    case "int": return Math.round(n).toLocaleString("ko-KR");
    case "won": return "₩" + Math.round(n).toLocaleString("ko-KR");
    case "pct": return (n * 100).toFixed(2) + "%";
    case "x": return (n * 100).toFixed(0) + "%";
    case "dec": return n.toFixed(2);
  }
}

// ── 매체별 분리 집계 ──────────────────────────────
const METRIC_KEYS: MetricKey[] = ["impressions", "clicks", "cost", "conversions", "revenue"];

// '매체/채널' 같은 그룹 컬럼 자동 감지
export function detectGroupColumn(headers: string[]): number {
  const aliases = ["매체", "매체명", "media", "채널", "channel", "플랫폼", "platform"];
  for (let i = 0; i < headers.length; i++) {
    const toks = tokenize(headers[i]);
    if (toks.some((t) => aliases.includes(t))) return i;
  }
  return -1;
}

export type GroupSummary = { name: string; summary: MetricSummary };

// 그룹(매체) 컬럼이 있으면 매체별로 나눠 집계. 없으면 빈 배열.
export function analyzeGroups(grid: unknown[][], override?: LabelMap): GroupSummary[] {
  if (grid.length < 2) return [];
  const headers = grid[0].map((h) => String(h ?? ""));
  const gi = detectGroupColumn(headers);
  if (gi < 0) return [];

  const cols: Partial<Record<MetricKey, number>> = {};
  METRIC_KEYS.forEach((m) => {
    cols[m] = bestColumn(headers, COLUMN_ALIASES[m], override?.[m]);
  });

  const groups = new Map<string, unknown[][]>();
  for (const r of grid.slice(1)) {
    const g = String(r[gi] ?? "").trim();
    if (!g || g.startsWith("*")) continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(r);
  }

  const out: GroupSummary[] = [];
  groups.forEach((rows, name) => {
    const totals = EMPTY_TOTALS();
    METRIC_KEYS.forEach((m) => {
      const idx = cols[m];
      if (idx != null && idx >= 0) totals[m] = rows.reduce((s, rr) => s + num(rr[idx]), 0);
    });
    out.push({ name, summary: withDerived("flat", totals, rows.length) });
  });

  out.sort((a, b) => b.summary.totals.cost - a.summary.totals.cost);
  return out;
}
