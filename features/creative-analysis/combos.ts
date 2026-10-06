// 조합 분석(순수 함수) — 성별·연령·타겟·캠페인 목표·콘텐츠·상품·모델·TVC… 두 축을 교차해 효율을 비교하고,
// '유의미한 조합'을 자동으로 찾는다.
// 유의미 = ① 표본 충분(전환 지표는 전환 5건↑, CTR은 클릭 50건↑, 소재 2개↑) ② 90% 구간이 전체 평균을 벗어남
//          (포아송 근사 지표×(1±1.645/√건수) — decision.ts 판정과 같은 방식, 주문 금액 편차는 반영 못 함)
// 조합 효과(시너지) = 실제 ÷ 기대값. 기대값 = 행 값 × 열 값 ÷ 평균(두 요소가 서로 무관하다고 볼 때). 1.15배↑/0.87배↓면
// '조합 효과', 아니면 '한 요소 덕분'(그 조합이 좋은 건 한쪽 요소가 원래 좋아서).
// 기준: 성별·연령·타겟 = 메타 실제 타겟팅(광고세트), 캠페인 목표 = 캠페인 objective, 나머지 = 소재명, 캠페인 유형 = UTM 규칙.
import type { Enriched } from "./analyze";
import { campaignKind, KIND_LABEL } from "./decision";
import type { ThemeStat } from "./groups";
import { fieldDims } from "./nameSchema";

export type ComboMetric = "roas" | "cpa" | "ctr" | "cvr";
export type ComboDim = { key: string; label: string; basis: "타겟팅" | "리포트·타겟팅" | "캠페인" | "소재명" | "UTM"; get: (r: Enriched) => string | string[] | null };

const OBJ_LABEL: Record<string, string> = {
  OUTCOME_SALES: "전환(판매)",
  OUTCOME_TRAFFIC: "트래픽",
  OUTCOME_AWARENESS: "인지도",
  OUTCOME_ENGAGEMENT: "참여",
  OUTCOME_LEADS: "잠재고객",
  OUTCOME_APP_PROMOTION: "앱 홍보",
  CONVERSIONS: "전환(판매)",
  LINK_CLICKS: "트래픽",
};
const FORMAT_LABEL: Record<string, string> = { video: "영상", image: "이미지", dynamic: "다이내믹", carousel: "슬라이드", other: "기타" };

export const COMBO_DIMENSIONS: ComboDim[] = [
  // 성별·연령대 — 실제 성과 구간으로 쪼갠 행(demo)이면 리포트 값(남성·25-34…), 아니면 광고세트 타겟팅 설정
  { key: "gender", label: "성별", basis: "리포트·타겟팅", get: (r) => (r.demo ? r.demo.gender : r.target ? (r.target.gender === "전체" ? "남녀 전체" : `${r.target.gender}성`) : null) },
  { key: "age", label: "연령대", basis: "리포트·타겟팅", get: (r) => (r.demo ? r.demo.age : r.target?.age ?? null) },
  { key: "audience", label: "타겟", basis: "타겟팅", get: (r) => r.target?.audienceType ?? null },
  { key: "objective", label: "캠페인 목표", basis: "캠페인", get: (r) => (r.campaign?.objective ? OBJ_LABEL[r.campaign.objective] ?? r.campaign.objective : r.parsed.objective) },
  { key: "format", label: "포맷", basis: "소재명", get: (r) => FORMAT_LABEL[r.format] ?? r.format },
  { key: "kind", label: "캠페인 유형", basis: "UTM", get: (r) => KIND_LABEL[campaignKind(r)] },
];
// 구조상 겹치는 짝(같은 정보를 두 번 보는 셈) — 자동 발굴에서 뺀다
const REDUNDANT = new Set(["nf:모델|nf:TVC", "kind|nf:TVC"]); // 내장 해석의 겹치는 짝

export const METRIC_META: Record<ComboMetric, { label: string; fmt: "x" | "won" | "pct"; higher: boolean; countLabel: string; min: number }> = {
  roas: { label: "ROAS", fmt: "x", higher: true, countLabel: "전환", min: 5 },
  cpa: { label: "CPA", fmt: "won", higher: false, countLabel: "전환", min: 5 },
  ctr: { label: "CTR", fmt: "pct", higher: true, countLabel: "클릭", min: 50 },
  cvr: { label: "CVR", fmt: "pct", higher: true, countLabel: "전환", min: 5 },
};
const Z = 1.645;

export type Agg = { rows: Enriched[]; n: number /* 소재 수(구간으로 쪼갠 행도 소재 단위로 셈) */; cost: number; revenue: number; conversions: number; impressions: number; linkClicks: number };
export type Verdict = "good" | "bad" | "flat" | "thin";
export type Stat = Agg & { value: number | null; low: number | null; high: number | null; verdict: Verdict; vsBase: number | null; impact: number };

export function agg(rows: Enriched[]): Agg {
  const a: Agg = { rows, n: new Set(rows.map((r) => r.id)).size, cost: 0, revenue: 0, conversions: 0, impressions: 0, linkClicks: 0 };
  for (const r of rows) {
    a.cost += r.cost;
    a.revenue += r.revenue;
    a.conversions += r.conversions;
    a.impressions += r.impressions;
    a.linkClicks += r.linkClicks;
  }
  return a;
}

export function metricOf(a: Pick<Agg, "cost" | "revenue" | "conversions" | "impressions" | "linkClicks">, m: ComboMetric): number | null {
  const d = (x: number, y: number) => (y > 0 ? x / y : null);
  return m === "roas" ? d(a.revenue, a.cost) : m === "cpa" ? d(a.cost, a.conversions) : m === "ctr" ? d(a.linkClicks, a.impressions) : d(a.conversions, a.linkClicks);
}
const countOf = (a: Agg, m: ComboMetric) => (m === "ctr" ? a.linkClicks : a.conversions);

export function statOf(a: Agg, m: ComboMetric, base: number | null): Stat {
  const meta = METRIC_META[m];
  const value = metricOf(a, m);
  const count = countOf(a, m);
  let low: number | null = null;
  let high: number | null = null;
  let verdict: Verdict = "thin";
  if (value != null && count >= meta.min) {
    const rel = Z / Math.sqrt(count);
    // CPA는 전환 수의 역수라 구간이 비대칭
    [low, high] = m === "cpa" ? [value / (1 + rel), value / Math.max(0.05, 1 - rel)] : [value * Math.max(0, 1 - rel), value * (1 + rel)];
    if (base == null) verdict = "flat";
    else if (low > base) verdict = meta.higher ? "good" : "bad";
    else if (high < base) verdict = meta.higher ? "bad" : "good";
    else verdict = "flat";
  }
  // 평균 대비 '더 얻은(잃은)' 양 — ROAS=매출(원), CPA=전환 수, CTR=클릭 수, CVR=전환 수. +면 좋음
  let impact = 0;
  if (base != null && value != null) {
    if (m === "roas") impact = a.revenue - a.cost * base;
    else if (m === "cpa") impact = a.conversions - a.cost / base;
    else if (m === "ctr") impact = a.linkClicks - a.impressions * base;
    else impact = a.conversions - a.linkClicks * base;
  }
  return { ...a, value, low, high, verdict, vsBase: value != null && base ? value / base : null, impact };
}

function valuesOf(r: Enriched, d: ComboDim): string[] {
  const v = d.get(r);
  return Array.isArray(v) ? v : v ? [v] : [];
}

export function groupBy(rows: Enriched[], d: ComboDim): Map<string, Enriched[]> {
  const m = new Map<string, Enriched[]>();
  for (const r of rows)
    for (const k of valuesOf(r, d)) {
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
  return m;
}

export const OTHER = "기타";

export type CrossTab = {
  base: number | null;
  rowKeys: string[];
  colKeys: string[];
  rowStats: Map<string, Stat>;
  colStats: Map<string, Stat>;
  cells: Map<string, Stat & { expected: number | null; synergy: number | null }>; // key `${row}\u0000${col}`
  total: Stat;
  foldedRows: number; // '기타'로 접힌 행 조합 수
};
export const cellKey = (r: string, c: string) => `${r}\u0000${c}`;

// 축마다 광고비 상위 maxKeys개, 나머지는 '기타'로 접는다
export function crossTab(rows: Enriched[], rowDim: ComboDim, colDim: ComboDim, m: ComboMetric, maxKeys = 8, maxRows = maxKeys): CrossTab {
  const total0 = agg(rows);
  const base = metricOf(total0, m);
  const fold = (d: ComboDim, max: number) => {
    const g = groupBy(rows, d);
    const keys = [...g.entries()].sort((a, b) => agg(b[1]).cost - agg(a[1]).cost).map(([k]) => k);
    const keep = new Set(keys.slice(0, max));
    return { keys: keys.length > max ? [...keys.slice(0, max), OTHER] : keys, map: (k: string) => (keep.has(k) ? k : OTHER), folded: Math.max(0, keys.length - max) };
  };
  const R = fold(rowDim, maxRows);
  const C = fold(colDim, maxKeys);
  const byRow = new Map<string, Enriched[]>();
  const byCol = new Map<string, Enriched[]>();
  const byCell = new Map<string, Enriched[]>();
  const push = (m2: Map<string, Enriched[]>, k: string, r: Enriched) => {
    const arr = m2.get(k);
    if (arr) {
      if (arr[arr.length - 1] !== r) arr.push(r); // '기타'로 여러 값이 접힐 때 같은 소재 중복 방지
    } else m2.set(k, [r]);
  };
  for (const r of rows) {
    const rv = [...new Set(valuesOf(r, rowDim).map(R.map))];
    const cv = [...new Set(valuesOf(r, colDim).map(C.map))];
    for (const a of rv) push(byRow, a, r);
    for (const b of cv) push(byCol, b, r);
    for (const a of rv) for (const b of cv) push(byCell, cellKey(a, b), r);
  }
  const rowStats = new Map([...byRow].map(([k, v]) => [k, statOf(agg(v), m, base)]));
  const colStats = new Map([...byCol].map(([k, v]) => [k, statOf(agg(v), m, base)]));
  const cells: CrossTab["cells"] = new Map();
  for (const [k, v] of byCell) {
    const [a, b] = k.split("\u0000");
    const s = statOf(agg(v), m, base);
    const rv = rowStats.get(a)?.value;
    const cv = colStats.get(b)?.value;
    const expected = base && rv != null && cv != null ? (rv * cv) / base : null;
    cells.set(k, { ...s, expected, synergy: expected && s.value != null ? s.value / expected : null });
  }
  return { base, rowKeys: R.keys.filter((k) => byRow.has(k)), colKeys: C.keys.filter((k) => byCol.has(k)), rowStats, colStats, cells, total: statOf(total0, m, base), foldedRows: R.folded };
}

export type Discovery = Stat & {
  rowDim: ComboDim;
  colDim: ComboDim;
  row: string;
  col: string;
  expected: number | null;
  synergy: number | null;
  combo: boolean; // 조합 효과(한 요소만으로 설명 안 됨)
};

// 모든 축 짝 × 모든 칸에서 유의미한 조합을 찾아 영향(평균 대비 더 얻은/잃은 양) 순으로
export function discoverCombos(rows: Enriched[], m: ComboMetric, dims: ComboDim[] = COMBO_DIMENSIONS, limit = 12): Discovery[] {
  const base = metricOf(agg(rows), m);
  if (base == null) return [];
  const live = dims.filter((d) => groupBy(rows, d).size >= 2); // 값이 하나뿐인 축은 비교 의미 없음
  const out: Discovery[] = [];
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const A = live[i];
      const B = live[j];
      if (REDUNDANT.has(`${A.key}|${B.key}`) || REDUNDANT.has(`${B.key}|${A.key}`)) continue;
      const ga = groupBy(rows, A);
      const gb = groupBy(rows, B);
      const sa = new Map([...ga].map(([k, v]) => [k, statOf(agg(v), m, base)]));
      const sb = new Map([...gb].map(([k, v]) => [k, statOf(agg(v), m, base)]));
      for (const [a, ra] of ga) {
        const setA = new Set(ra);
        for (const [b, rb] of gb) {
          const both = rb.filter((r) => setA.has(r));
          if (both.length < 2 || both.length === ra.length || both.length === rb.length) continue; // 한 축 값과 똑같은 묶음은 조합이 아님
          const s = statOf(agg(both), m, base);
          if (s.verdict !== "good" && s.verdict !== "bad") continue;
          const va = sa.get(a)?.value;
          const vb = sb.get(b)?.value;
          const expected = va != null && vb != null ? (va * vb) / base : null;
          const synergy = expected && s.value != null ? s.value / expected : null;
          const better = METRIC_META[m].higher ? (synergy ?? 1) : 1 / (synergy ?? 1);
          const combo = s.verdict === "good" ? better >= 1.15 : better <= 0.87;
          // 조합 효과가 없고 한쪽 요소만 봐도 같은 방향으로 확실하면 그 요소 하나의 결과 — 요소별 표에서 보이므로 뺀다
          if (!combo && (sa.get(a)?.verdict === s.verdict || sb.get(b)?.verdict === s.verdict)) continue;
          out.push({ ...s, rowDim: A, colDim: B, row: a, col: b, expected, synergy, combo });
        }
      }
    }
  // 조합 효과 우선 → 영향 크기 순, 같은 소재 묶음이 여러 짝에서 반복되면 하나만
  const seen = new Set<string>();
  return out
    .sort((x, y) => Number(y.combo) - Number(x.combo) || Math.abs(y.impact) - Math.abs(x.impact))
    .filter((d) => {
      const sig = d.rows.map(rowSig).sort().join(",");
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    })
    .slice(0, limit);
}

// ── 여러 축 조합(체크한 축들의 값 묶음을 한 행으로) ─────────────────────────────
export const SEP = "\u0001"; // 조합 키 안의 축 구분(화면에선 칸으로 나눠 그림)
export const ALL = "전체";

// 체크한 축들을 하나의 축처럼 — 값 = 각 축 값의 데카르트 곱(상품이 여러 개인 소재는 상품마다). 정보가 없는 축은 '… 정보 없음'
export function compositeDim(dims: ComboDim[]): ComboDim {
  return {
    key: dims.map((d) => d.key).join("+") || "all",
    label: dims.map((d) => d.label).join(" · ") || ALL,
    basis: "소재명",
    get: (r) => {
      if (!dims.length) return ALL;
      let acc = [""];
      for (const d of dims) {
        const vals = valuesOf(r, d);
        const vs = vals.length ? vals : [`${d.label} 정보 없음`];
        acc = acc.flatMap((a) => vs.map((v) => (a ? `${a}${SEP}${v}` : v)));
      }
      return acc;
    },
  };
}
export const ALL_DIM: ComboDim = { key: "all", label: ALL, basis: "소재명", get: () => ALL };

// 선택 줄에 보일 항목 — 타겟팅·캠페인 축 + 광고주 규칙의 소재명 항목(이름 그대로) + 포맷·캠페인 유형. 정보가 아예 없는 항목만 뺌
export const availableDims = (rows: Enriched[]): ComboDim[] => {
  const fixed = COMBO_DIMENSIONS.filter((d) => d.key !== "format" && d.key !== "kind");
  const tail = COMBO_DIMENSIONS.filter((d) => d.key === "format" || d.key === "kind");
  // 항목 이름이 고정 축과 겹치면(예: 광고주가 '캠페인 목표'라는 항목을 만듦) 소재명 쪽에 표시를 붙여 구분
  const taken = new Set(COMBO_DIMENSIONS.map((d) => d.label));
  const named = fieldDims(rows).map((d) => (taken.has(d.label) ? { ...d, label: `${d.label}(소재명)` } : d));
  return [...fixed, ...named, ...tail].filter((d) => groupBy(rows, d).size >= 1);
};
export const distinctValues = (rows: Enriched[], d: ComboDim) => [...groupBy(rows, d).keys()];

// 성과 맵용 — 체크한 항목 값의 조합을 버블 하나로(ThemeStat 모양, 키 `c:<조합>`), 광고비 상위 top개 + 기타
export const COMBO_PREFIX = "c:";
export function comboStats(rows: Enriched[], dims: ComboDim[], top = 12): { list: ThemeStat[]; roas: number | null; ctr: number | null } {
  const g = groupBy(rows, compositeDim(dims));
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const all: ThemeStat[] = [...g].map(([k, rs]) => {
    const a = agg(rs);
    return { key: COMBO_PREFIX + k, label: k.split(SEP).join(" · "), n: a.n, cost: a.cost, revenue: a.revenue, clicks: a.linkClicks, impressions: a.impressions, roas: metricOf(a, "roas"), ctr: metricOf(a, "ctr"), share: total > 0 ? a.cost / total : 0 };
  });
  all.sort((a, b) => b.cost - a.cost);
  const head = all.slice(0, top);
  const rest = all.slice(top);
  if (rest.length) {
    const s = rest.reduce((a, t) => ({ n: a.n + t.n, cost: a.cost + t.cost, revenue: a.revenue + t.revenue, clicks: a.clicks + t.clicks, impressions: a.impressions + t.impressions }), { n: 0, cost: 0, revenue: 0, clicks: 0, impressions: 0 });
    head.push({ key: "rest", label: `기타 ${rest.length}개`, ...s, roas: s.cost > 0 ? s.revenue / s.cost : null, ctr: s.impressions > 0 ? s.clicks / s.impressions : null, share: total > 0 ? s.cost / total : 0 });
  }
  const t = agg(rows);
  return { list: head, roas: metricOf(t, "roas"), ctr: metricOf(t, "ctr") };
}
// 맵에서 고른 조합 키들 → 소재 판별(갤러리 필터)
export function comboMatcher(dims: ComboDim[], keys: string[]): (r: Enriched) => boolean {
  const want = new Set(keys.filter((k) => k.startsWith(COMBO_PREFIX)).map((k) => k.slice(COMBO_PREFIX.length)));
  const cd = compositeDim(dims);
  return (r) => [cd.get(r)].flat().some((v) => v != null && want.has(v));
}

// ── 실제 성별·연령 구간(메타 breakdowns=age,gender) ─────────────────────────────
export const DEMO_DIM_KEYS = ["gender", "age"];
const rowSig = (r: Enriched) => (r.demo ? `${r.id}|${r.demo.age}|${r.demo.gender}` : r.id);
type DemoInput = { adId: string; age: string; gender: string; impressions: number; linkClicks: number; cost: number; conversions: number; revenue: number };

// 소재 행을 실제 구간 행으로 쪼갬 — 지표는 그 구간 값으로 바꾸고 나머지(소재명·타겟·캠페인)는 그대로. 리포트에 없는 소재는 '미상' 한 행
export function expandDemo(rows: Enriched[], demo: DemoInput[]): { rows: Enriched[]; coverage: number | null } {
  const by = new Map<string, DemoInput[]>();
  for (const d of demo) {
    const arr = by.get(d.adId);
    if (arr) arr.push(d);
    else by.set(d.adId, [d]);
  }
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  let segCost = 0;
  const out = rows.flatMap((r) => {
    const segs = by.get(r.id);
    if (!segs?.length) return [{ ...r, demo: { age: "연령 미상", gender: "성별 미상" } }];
    return segs.map((s) => {
      segCost += s.cost;
      return { ...r, demo: { age: s.age, gender: s.gender }, impressions: s.impressions, linkClicks: s.linkClicks, cost: s.cost, conversions: s.conversions, revenue: s.revenue, roas: div(s.revenue, s.cost), cpa: div(s.cost, s.conversions), ctr: div(s.linkClicks, s.impressions), cvr: div(s.conversions, s.linkClicks) };
    });
  });
  const total = rows.reduce((a, r) => a + r.cost, 0);
  return { rows: out, coverage: total > 0 ? segCost / total : null };
}
