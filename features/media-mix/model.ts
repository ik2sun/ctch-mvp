// 미디어믹스 예측 모델 — 순수 함수(화면·API 공용). API 비용 없음.
//
// 1) 반응 곡선: 매체별 일별 (광고비, 매출/전환)으로 y = a·x^b 를 적합한다(로그-로그 회귀).
//    b<1 이면 예산을 늘릴수록 한계 효율이 떨어진다(체감 수익, Diminishing Returns).
//    일별 변동만으로는 탄력성 추정이 흔들리므로 데이터가 적거나 설명력이 낮으면 사전값 PRIOR_B 쪽으로 당긴다.
//    a 는 기간 평균점(평균 일 광고비 → 평균 일 성과)을 지나도록 맞춘다 — 근사 일별(네이버 SA 상위 캠페인)이어도 합계는 맞는다.
// 2) 배분: 잠금 매체를 뺀 예산을 작은 단위로 나눠, 그때그때 한계 성과가 가장 큰 매체에 준다(한계 효율 균등화).
//    관측 범위(평균 일 광고비의 MIN_X~MAX_X배)를 넘는 배분은 외삽으로 표시한다.
import type { DailyPoint, Totals } from "@/features/ai-report/metaTypes";

export type Objective = "revenue" | "conversions" | "cpa";

export const OBJECTIVES: { key: Objective; label: string; desc: string }[] = [
  { key: "revenue", label: "매출(ROAS) 극대화", desc: "예산을 모두 쓰면서 예상 매출이 가장 커지는 배분" },
  { key: "conversions", label: "전환수 극대화", desc: "예산을 모두 쓰면서 예상 전환이 가장 많아지는 배분" },
  { key: "cpa", label: "CPA 최소화", desc: "한계 CPA가 목표를 넘는 예산은 쓰지 않고 남겨요" },
];

const PRIOR_B = 0.65; // 퍼포먼스 매체에서 흔한 탄력성 중앙값(사전값)
const B_MIN = 0.3;
const B_MAX = 0.95;
export const MIN_X = 0.3; // 관측 평균 대비 배분 하한(매체를 갑자기 끄지 않음)
export const MAX_X = 2.5; // 관측 평균 대비 상한 — 넘으면 외삽

export type Curve = {
  a: number;
  b: number;
  r2: number | null; // 로그-로그 회귀 설명력(적합 못 했으면 null)
  n: number; // 적합에 쓴 일수
  weight: number; // 적합값 반영 비중 0~1 (나머지는 사전값)
};

export type Confidence = "high" | "mid" | "low";

export type MediaModel = {
  key: string;
  label: string;
  color: string;
  days: number; // 학습 기간 일수
  avgDailyCost: number;
  maxDailyCost: number;
  totals: Totals;
  revenue: Curve;
  conversions: Curve;
  confidence: Confidence;
  dailyApprox?: boolean;
};

export type MediaInput = {
  key: string;
  label: string;
  color: string;
  totals: Totals;
  daily: DailyPoint[];
  days: number;
  dailyApprox?: boolean;
};

// 일 광고비 x → 일 성과
export function curveAt(c: Curve, x: number): number {
  return x > 0 ? c.a * Math.pow(x, c.b) : 0;
}
// 한계 성과(d성과/d광고비)
function marginalAt(c: Curve, x: number): number {
  if (c.a <= 0) return 0;
  const xx = Math.max(x, 1);
  return c.a * c.b * Math.pow(xx, c.b - 1);
}

function fitCurve(points: { x: number; y: number }[], avgX: number, avgY: number): Curve {
  const pts = points.filter((p) => p.x > 0 && p.y > 0);
  const n = pts.length;
  let b = PRIOR_B;
  let r2: number | null = null;
  let weight = 0;
  if (n >= 7) {
    const lx = pts.map((p) => Math.log(p.x));
    const ly = pts.map((p) => Math.log(p.y));
    const mx = lx.reduce((s, v) => s + v, 0) / n;
    const my = ly.reduce((s, v) => s + v, 0) / n;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      sxx += (lx[i] - mx) ** 2;
      sxy += (lx[i] - mx) * (ly[i] - my);
      syy += (ly[i] - my) ** 2;
    }
    const sdx = Math.sqrt(sxx / n);
    // 광고비가 거의 일정했다면(로그 표준편차 0.08 미만) 기울기를 믿을 수 없다
    if (sxx > 0 && syy > 0 && sdx >= 0.08) {
      const fitted = sxy / sxx;
      r2 = (sxy * sxy) / (sxx * syy);
      weight = Math.min(1, (n - 6) / 40) * Math.min(1, r2 * 2.5) * (fitted > 0 ? 1 : 0);
      b = weight * Math.min(B_MAX, Math.max(B_MIN, fitted)) + (1 - weight) * PRIOR_B;
    }
  }
  b = Math.min(B_MAX, Math.max(B_MIN, b));
  const a = avgX > 0 && avgY > 0 ? avgY / Math.pow(avgX, b) : 0;
  return { a, b, r2, n, weight };
}

export function buildModel(m: MediaInput): MediaModel | null {
  const days = Math.max(1, m.days);
  const avgDailyCost = m.totals.cost / days;
  if (avgDailyCost <= 0) return null;
  const spendDays = m.daily.filter((d) => d.cost > 0);
  const revenue = fitCurve(
    spendDays.map((d) => ({ x: d.cost, y: d.revenue })),
    avgDailyCost,
    m.totals.revenue / days,
  );
  const conversions = fitCurve(
    spendDays.map((d) => ({ x: d.cost, y: d.conversions })),
    avgDailyCost,
    m.totals.conversions / days,
  );
  const w = Math.max(revenue.weight, conversions.weight);
  const confidence: Confidence = spendDays.length >= 28 && w >= 0.5 ? "high" : spendDays.length >= 14 && w >= 0.2 ? "mid" : "low";
  return {
    key: m.key,
    label: m.label,
    color: m.color,
    days,
    avgDailyCost,
    maxDailyCost: Math.max(avgDailyCost, ...spendDays.map((d) => d.cost)),
    totals: m.totals,
    revenue,
    conversions,
    confidence,
    dailyApprox: m.dailyApprox,
  };
}

// ── 배분 ─────────────────────────────────────────────

export type PlanInput = {
  models: MediaModel[];
  totalBudget: number; // 기간 총예산
  periodDays: number; // 집행 일수
  objective: Objective;
  targetRoas: number | null; // 배수(3 = 300%)
  targetCpa: number | null; // 원
  locks: Record<string, number>; // 잠근 매체 → 기간 예산
};

export type Prediction = { cost: number; revenue: number; conversions: number };

export type MediaPlanRow = {
  key: string;
  label: string;
  color: string;
  locked: boolean;
  share: number; // 학습 기간 광고비 비중(AS-IS 비중)
  asIs: number; // 같은 총예산을 현재 비중대로 쓸 때 기간 예산
  toBe: number;
  asIsPred: Prediction;
  toBePred: Prediction;
  marginalRoas: number | null; // TO-BE 지점의 한계 ROAS(배수)
  marginalCpa: number | null; // TO-BE 지점의 한계 CPA(원)
  saturation: number | null; // 효율 한계점 — 이 기간 예산을 넘으면 한계 ROAS<100% 또는 한계 CPA>기준
  extrapolated: boolean; // 관측 범위 밖 배분
  confidence: Confidence;
};

export type Plan = {
  rows: MediaPlanRow[];
  asIs: Prediction;
  toBe: Prediction;
  unspent: number; // CPA 최소화에서 쓰지 않기를 권하는 예산
  cpaThreshold: number | null; // CPA 최소화에서 쓴 한계 CPA 기준
  lockedTotal: number;
  overLocked: boolean; // 잠금 합계가 총예산보다 큼
};

function objCurve(m: MediaModel, objective: Objective): Curve {
  return objective === "revenue" ? m.revenue : m.conversions;
}

export function predict(m: MediaModel, budget: number, periodDays: number): Prediction {
  const x = budget / Math.max(1, periodDays);
  return {
    cost: budget,
    revenue: curveAt(m.revenue, x) * periodDays,
    conversions: curveAt(m.conversions, x) * periodDays,
  };
}

function sumPred(list: Prediction[]): Prediction {
  return list.reduce((a, p) => ({ cost: a.cost + p.cost, revenue: a.revenue + p.revenue, conversions: a.conversions + p.conversions }), { cost: 0, revenue: 0, conversions: 0 });
}

// 기간 예산 → 일 예산 구간
function bounds(m: MediaModel, periodDays: number) {
  return { lo: m.avgDailyCost * MIN_X * periodDays, hi: m.avgDailyCost * MAX_X * periodDays };
}

// 기간 예산 b에서 한계 성과(기간 단위가 같아 일 단위 한계와 같다)
function marginal(m: MediaModel, objective: Objective, budget: number, periodDays: number): number {
  return marginalAt(objCurve(m, objective), budget / Math.max(1, periodDays));
}

// 한계 ROAS가 thr(배수) / 한계 CPA가 thr(원)에 닿는 기간 예산
function saturationBudget(m: MediaModel, objective: Objective, periodDays: number, cpaRef: number | null): number | null {
  const c = objective === "revenue" ? m.revenue : m.conversions;
  if (c.a <= 0 || c.b >= 1) return null;
  // revenue: 한계 매출/원 = 1 (한계 ROAS 100%), 전환: 한계 전환/원 = 1/cpaRef
  const thr = objective === "revenue" ? 1 : cpaRef && cpaRef > 0 ? 1 / cpaRef : null;
  if (thr == null) return null;
  const x = Math.pow((c.a * c.b) / thr, 1 / (1 - c.b));
  return Number.isFinite(x) ? x * periodDays : null;
}

export function optimize(input: PlanInput): Plan {
  const { models, totalBudget, periodDays, objective, locks } = input;
  const D = Math.max(1, periodDays);
  const totalHist = models.reduce((s, m) => s + m.totals.cost, 0);
  const share = (m: MediaModel) => (totalHist > 0 ? m.totals.cost / totalHist : 0);

  const lockedKeys = new Set(Object.keys(locks).filter((k) => models.some((m) => m.key === k)));
  const lockedTotal = [...lockedKeys].reduce((s, k) => s + Math.max(0, locks[k] || 0), 0);
  const free = Math.max(0, totalBudget - lockedTotal);
  const unlocked = models.filter((m) => !lockedKeys.has(m.key));

  // CPA 최소화 기준: 목표 CPA, 없으면 학습 기간 평균 CPA의 1.2배
  const histConv = models.reduce((s, m) => s + m.totals.conversions, 0);
  const histCpa = histConv > 0 ? totalHist / histConv : null;
  const cpaThreshold = objective === "cpa" ? (input.targetCpa && input.targetCpa > 0 ? input.targetCpa : histCpa ? histCpa * 1.2 : null) : null;

  // 시작점: 하한(합이 예산보다 크면 비율로 줄임)
  const alloc = new Map<string, number>();
  const caps = new Map<string, number>();
  let loSum = 0;
  for (const m of unlocked) {
    const { lo, hi } = bounds(m, D);
    alloc.set(m.key, lo);
    caps.set(m.key, hi);
    loSum += lo;
  }
  if (loSum > free && loSum > 0) for (const m of unlocked) alloc.set(m.key, (alloc.get(m.key)! * free) / loSum);
  let remaining = Math.max(0, free - Math.min(loSum, free));

  // 한계 효율 균등화 — 남은 예산을 STEPS 조각으로 나눠 한계 성과 최댓값에 배정
  const STEPS = 600;
  const step = remaining / STEPS;
  let unspent = 0;
  if (step > 0 && unlocked.length) {
    for (let i = 0; i < STEPS && remaining > 1e-6; i++) {
      let best: MediaModel | null = null;
      let bestM = -1;
      let anyUnderCap = false;
      for (const m of unlocked) if (alloc.get(m.key)! < caps.get(m.key)!) anyUnderCap = true;
      for (const m of unlocked) {
        const cur = alloc.get(m.key)!;
        if (anyUnderCap && cur >= caps.get(m.key)!) continue; // 모두 상한이면 상한을 넘겨 외삽
        const mg = marginal(m, objective, cur, D);
        if (mg > bestM) {
          bestM = mg;
          best = m;
        }
      }
      if (!best || bestM <= 0) {
        // 성과 데이터가 없는 매체만 남음 — 현재 비중대로 나눈다
        const sh = unlocked.reduce((s, m) => s + share(m), 0) || 1;
        for (const m of unlocked) alloc.set(m.key, alloc.get(m.key)! + (remaining * share(m)) / sh);
        remaining = 0;
        break;
      }
      if (cpaThreshold && 1 / bestM > cpaThreshold) {
        unspent = remaining;
        remaining = 0;
        break;
      }
      // 상한 아래에 있던 매체는 상한까지만(마지막 조각이 상한을 넘어 외삽으로 표시되지 않게)
      const cur = alloc.get(best.key)!;
      const cap = caps.get(best.key)!;
      const amt = Math.min(step, remaining, anyUnderCap ? Math.max(cap - cur, 0) : Infinity);
      if (amt <= 0) break;
      alloc.set(best.key, cur + amt);
      remaining -= amt;
    }
  }

  const satCpa = saturationCpa(input.targetCpa, cpaThreshold, histCpa);
  const rows: MediaPlanRow[] = models.map((m) => {
    const locked = lockedKeys.has(m.key);
    const toBe = locked ? Math.max(0, locks[m.key] || 0) : alloc.get(m.key) ?? 0;
    return makeRow(m, share(m), totalBudget, toBe, locked, D, objective, satCpa);
  });

  return {
    rows,
    asIs: sumPred(rows.map((r) => r.asIsPred)),
    toBe: sumPred(rows.map((r) => r.toBePred)),
    unspent,
    cpaThreshold,
    lockedTotal,
    overLocked: lockedTotal > totalBudget,
  };
}

// 전환 목표의 효율 한계점 기준 — 목표 CPA → CPA 최소화 기준 → 평균 CPA의 1.5배
// (한계 CPA는 늘 평균 CPA보다 크므로 평균 CPA를 기준으로 삼으면 모든 매체가 한계를 넘은 것으로 보인다)
function saturationCpa(targetCpa: number | null, cpaThreshold: number | null, histCpa: number | null): number | null {
  if (targetCpa && targetCpa > 0) return targetCpa;
  if (cpaThreshold) return cpaThreshold;
  return histCpa ? histCpa * 1.5 : null;
}

function makeRow(m: MediaModel, share: number, totalBudget: number, toBe: number, locked: boolean, D: number, objective: Objective, cpaRef: number | null): MediaPlanRow {
  const asIs = totalBudget * share;
  const x = toBe / D;
  const mr = marginalAt(m.revenue, x);
  const mc = marginalAt(m.conversions, x);
  const { hi } = bounds(m, D);
  return {
    key: m.key,
    label: m.label,
    color: m.color,
    locked,
    share,
    asIs,
    toBe,
    asIsPred: predict(m, asIs, D),
    toBePred: predict(m, toBe, D),
    marginalRoas: m.revenue.a > 0 && toBe > 0 ? mr : null,
    marginalCpa: mc > 0 && toBe > 0 ? 1 / mc : null,
    saturation: saturationBudget(m, objective === "revenue" ? "revenue" : "conversions", D, cpaRef),
    extrapolated: toBe > hi * 1.001,
    confidence: m.confidence,
  };
}

// 사용자가 슬라이더로 조정한 배분을 다시 계산(배분 자체는 그대로, 예측만 갱신)
export function evaluate(input: PlanInput, budgets: Record<string, number>, base: Plan): Plan {
  const D = Math.max(1, input.periodDays);
  const histCost = input.models.reduce((s, m) => s + m.totals.cost, 0);
  const histConv = input.models.reduce((s, m) => s + m.totals.conversions, 0);
  const satCpa = saturationCpa(input.targetCpa, base.cpaThreshold, histConv > 0 ? histCost / histConv : null);
  const rows = base.rows.map((r) => {
    const m = input.models.find((x) => x.key === r.key)!;
    return makeRow(m, r.share, input.totalBudget, budgets[r.key] ?? r.toBe, r.locked, D, input.objective, satCpa);
  });
  return { ...base, rows, toBe: sumPred(rows.map((r) => r.toBePred)) };
}

// 목표 ROAS(또는 CPA)를 지키면서 쓸 수 있는 최대 총예산 — 이분 탐색(잠금은 그대로)
export function maxBudgetForTarget(input: PlanInput): number | null {
  const isRoas = input.objective === "revenue" && input.targetRoas && input.targetRoas > 0;
  const isCpa = input.objective === "conversions" && input.targetCpa && input.targetCpa > 0;
  if (!isRoas && !isCpa) return null;
  const ok = (budget: number) => {
    const p = optimize({ ...input, totalBudget: budget }).toBe;
    if (p.cost <= 0) return true;
    return isRoas ? p.revenue / p.cost >= input.targetRoas! : p.conversions > 0 && p.cost / p.conversions <= input.targetCpa!;
  };
  const hist = input.models.reduce((s, m) => s + m.avgDailyCost, 0) * Math.max(1, input.periodDays);
  let lo = 0;
  let hi = Math.max(input.totalBudget, hist) * 4;
  if (ok(hi)) return null; // 탐색 범위 안에서는 항상 달성 — 표시하지 않음
  if (!ok(Math.max(1, hist * 0.05))) return 0;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

// 반응 곡선 차트용 점 — 기간 예산 0~상한
export function curvePoints(m: MediaModel, objective: Objective, periodDays: number, maxBudget: number, n = 40): { x: number; y: number }[] {
  const c = objective === "revenue" ? m.revenue : m.conversions;
  const D = Math.max(1, periodDays);
  return Array.from({ length: n + 1 }, (_, i) => {
    const b = (maxBudget * i) / n;
    return { x: b, y: curveAt(c, b / D) * D };
  });
}
