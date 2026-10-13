// 상관관계 분석 — 순수 함수(화면 전용 계산, API 비용 없음).
//
// 질문: 영상·도달·트래픽·참여 캠페인(원인)이 전환·검색 캠페인 성과(결과)를 움직였나?
// 1) 일별 시계열을 맞추고, 요일 효과와 선형 추세를 걷어낸다(둘 다 늘기만 해도 상관이 높게 나오는 착시 방지).
// 2) 광고 효과는 며칠 남는다 → 잔존 효과(adstock: a_t = x_t + θ·a_{t-1}, θ ∈ 0/0.3/0.5/0.7)와 시차 0~14일을 모두 시험해 가장 강한 조합을 찾는다.
// 3) 일별 값은 서로 이어져(자기상관) 표본 수가 부풀려지므로 유효 표본 수로 유의성을 계산하고, 여러 조합을 시험한 만큼 보수적으로 본다.
// 4) 원인 전부를 한 번에 넣은 회귀(릿지)로 '원인 1만 원당 결과 몇 건'과 기여분(90% 구간)을 추정한다.
// 5) 통제 변수(선택): 성과 캠페인 광고비·행사 기간을 요일·추세와 함께 걷어낸다 — 인지 광고를 켤 때 성과 예산도 같이 늘렸거나
//    행사 기간에 둘 다 몰렸다면, 그 몫을 빼고도 관계가 남는지 본다(편상관 + 회귀 통제 변수).
// 상관은 인과가 아니다 — 화면 문구도 "함께 움직였다"로 쓴다.
import { DRIVER_ROLES, ROLE_META, type CorrCampaign, type DriverRole, type Role } from "./types";

export type Unit = "won" | "count" | "ratio" | "index";

export type Series = {
  key: string;
  label: string;
  values: (number | null)[];
  unit: Unit;
  color?: string;
  external?: boolean;
  additive: boolean; // 합산 가능한 양(회귀 기여도 계산 가능). 비율(ROAS·CPA)은 상관만
  noun?: string; // 건수 단위(건·회)
};

export const THETAS = [0, 0.3, 0.5, 0.7];
export const MAX_LAG = 14;

// ── 날짜 ─────────────────────────────────────────────
export function dateRange(since: string, until: string): string[] {
  const out: string[] = [];
  const d = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

// ── 시리즈 만들기 ─────────────────────────────────────
export type DriverMetric = "cost" | "impressions";

export function buildSeries(campaigns: CorrCampaign[], roles: Record<string, Role>, dates: string[], metric: DriverMetric) {
  const idx = new Map(dates.map((d, i) => [d, i]));
  const zero = () => dates.map(() => 0);
  const drv: Record<DriverRole, number[]> = { video: zero(), awareness: zero(), traffic: zero(), engagement: zero() };
  const perf = { cost: zero(), conv: zero(), rev: zero() };
  const search = { clicks: zero(), imps: zero() };
  const brand = { clicks: zero(), imps: zero() };
  let hasSearch = false;
  let hasBrand = false;
  let hasPerf = false;
  for (const c of campaigns) {
    const role = roles[c.id] ?? "other";
    for (const d of c.daily) {
      const i = idx.get(d.date);
      if (i == null) continue;
      if ((DRIVER_ROLES as readonly string[]).includes(role)) drv[role as DriverRole][i] += metric === "cost" ? d.cost : d.impressions;
      if (role === "conversion" || role === "search" || role === "brand_search") {
        hasPerf = true;
        perf.cost[i] += d.cost;
        perf.conv[i] += d.conversions;
        perf.rev[i] += d.revenue;
      }
      if (role === "search" || role === "brand_search") {
        hasSearch = true;
        search.clicks[i] += d.clicks;
        search.imps[i] += d.impressions;
      }
      if (role === "brand_search") {
        hasBrand = true;
        brand.clicks[i] += d.clicks;
        brand.imps[i] += d.impressions;
      }
    }
  }
  const drivers: Series[] = DRIVER_ROLES.filter((r) => drv[r].filter((v) => v > 0).length >= 5).map((r) => ({
    key: r,
    label: `${ROLE_META[r].label} ${metric === "cost" ? "광고비" : "노출"}`,
    values: drv[r],
    unit: metric === "cost" ? "won" : "count",
    color: ROLE_META[r].color,
    additive: true,
  }));
  const outcomes: Series[] = [];
  if (hasPerf) {
    outcomes.push(
      { key: "perf_conv", label: "성과 캠페인 전환", values: perf.conv, unit: "count", additive: true, noun: "건" },
      { key: "perf_rev", label: "성과 캠페인 매출", values: perf.rev, unit: "won", additive: true },
      { key: "perf_roas", label: "성과 캠페인 ROAS", values: perf.cost.map((c, i) => (c > 0 ? perf.rev[i] / c : null)), unit: "ratio", additive: false },
      { key: "perf_cpa", label: "성과 캠페인 CPA", values: perf.conv.map((v, i) => (v > 0 ? perf.cost[i] / v : null)), unit: "won", additive: false },
    );
  }
  if (hasSearch) outcomes.push({ key: "search_clicks", label: "검색광고 클릭", values: search.clicks, unit: "count", additive: true, noun: "회" });
  if (hasBrand) outcomes.push({ key: "brand_clicks", label: "브랜드검색 클릭", values: brand.clicks, unit: "count", additive: true, noun: "회" });
  // 성과 캠페인 광고비 — 원인과 같이 움직였는지(예산 동시 증감) 점검용
  return { drivers, outcomes, perfCost: perf.cost };
}

// ── 선형대수(작은 행렬) ───────────────────────────────
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}
function invert(A: number[][]): number[][] | null {
  const n = A.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = A.map((_, i) => (i === j ? 1 : 0));
    const x = solve(A, e);
    if (!x) return null;
    cols.push(x);
  }
  return A.map((_, i) => cols.map((c) => c[i]));
}

// 요일 더미 6개 + 추세 + 절편
// extra = 추가 통제 변수 열(날짜 순, 표준화된 값) — 성과 캠페인 광고비·행사 기간 더미
export type Extra = number[][];
function controls(dates: string[], i: number, withTrend = true, extra?: Extra): number[] {
  const dow = new Date(`${dates[i]}T00:00:00Z`).getUTCDay();
  const row = [1];
  if (withTrend) row.push(i / Math.max(1, dates.length - 1));
  for (let k = 1; k < 7; k++) row.push(dow === k ? 1 : 0);
  if (extra) for (const col of extra) row.push(col[i] ?? 0);
  return row;
}

// 통제 변수 열 만들기 — 표준화(z), 값이 하나뿐이면(변동 없음) 버린다
export function makeExtra(cols: (number[] | null | undefined)[]): Extra | undefined {
  const out: Extra = [];
  for (const c of cols) {
    if (!c || !c.length) continue;
    const m = c.reduce((s, v) => s + v, 0) / c.length;
    const sd = Math.sqrt(c.reduce((s, v) => s + (v - m) ** 2, 0) / c.length);
    if (!(sd > 0)) continue;
    out.push(c.map((v) => (v - m) / sd));
  }
  return out.length ? out : undefined;
}

// 요일·추세를 걷어낸 잔차(없는 값은 null 유지)
export function residualize(y: (number | null)[], dates: string[], withTrend = true, extra?: Extra): (number | null)[] {
  const rows: number[][] = [];
  const ys: number[] = [];
  y.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) return;
    rows.push(controls(dates, i, withTrend, extra));
    ys.push(v);
  });
  const p = rows[0]?.length ?? 0;
  if (rows.length < p + 3) return y.map((v) => v);
  const XtX = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => rows.reduce((s, r) => s + r[a] * r[b], 0) + (a === b ? 1e-6 : 0)));
  const Xty = Array.from({ length: p }, (_, a) => rows.reduce((s, r, k) => s + r[a] * ys[k], 0));
  const beta = solve(XtX, Xty);
  if (!beta) return y.map((v) => v);
  return y.map((v, i) => (v == null || !Number.isFinite(v) ? null : v - controls(dates, i, withTrend, extra).reduce((s, x, k) => s + x * beta[k], 0)));
}

export function adstock(x: number[], theta: number): number[] {
  const out: number[] = [];
  let a = 0;
  for (const v of x) {
    a = v + theta * a;
    out.push(a);
  }
  return out;
}

function lagged<T>(x: (T | null)[], L: number): (T | null)[] {
  return x.map((_, i) => (i - L >= 0 ? x[i - L] : null));
}

function pairs(a: (number | null)[], b: (number | null)[]) {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    xs.push(x);
    ys.push(y);
  }
  return { xs, ys };
}

export function pearson(a: (number | null)[], b: (number | null)[]): { r: number | null; n: number } {
  const { xs, ys } = pairs(a, b);
  const n = xs.length;
  if (n < 8) return { r: null, n };
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (sxx <= 0 || syy <= 0) return { r: null, n };
  return { r: sxy / Math.sqrt(sxx * syy), n };
}

function lag1(x: (number | null)[]): number {
  const r = pearson(x.slice(1), x.slice(0, -1)).r;
  return r == null ? 0 : Math.max(-0.95, Math.min(0.95, r));
}

// ── t 분포(양측 p) — 정규화 불완전 베타 ─────────────────
function lgamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function ibeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
export function tPValue(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return 1;
  return ibeta(df / 2, 0.5, df / (df + t * t));
}

// ── 시차 상관 ─────────────────────────────────────────
export type Strength = "strong" | "moderate" | "weak" | "none";

export type LagResult = {
  driver: string;
  outcome: string;
  r: number | null; // 최적 조합의 상관
  lag: number;
  theta: number;
  n: number;
  nEff: number;
  p: number; // 다중 비교 보정 후
  strength: Strength;
  profile: { lag: number; r: number | null }[]; // 최적 θ에서 시차별 상관
  rCrit: number; // 보정 후 5% 유의 경계(|r|)
};

const MULTI = 6; // 60개 조합(시차 15 × θ 4)은 서로 강하게 겹친다 — 독립 시험 약 6개로 보고 보정

function strengthOf(p: number, r: number | null): Strength {
  if (r == null) return "none";
  if (p < 0.01 && Math.abs(r) >= 0.3) return "strong";
  if (p < 0.05) return "moderate";
  if (p < 0.2) return "weak";
  return "none";
}

// extra가 있으면 편상관 — 원인(시차 적용 후)과 결과 모두에서 같은 날의 통제 변수를 걷어낸다.
// fixed를 주면 시차·잔존을 그 값으로 고정해 검정만 한다(통제 후 60개 조합을 다시 뒤지면 행사 한 번에 맞춘 우연한 조합이 뽑힌다 — 르무통 90일 실측).
export function lagCorrelation(driver: Series, outcome: Series, dates: string[], extra?: Extra, fixed?: { lag: number; theta: number }): LagResult {
  const yr = residualize(outcome.values, dates, true, extra);
  const rhoY = lag1(yr);
  let best: { r: number; lag: number; theta: number; n: number; ar: (number | null)[] } | null = null;
  const byTheta = new Map<number, (number | null)[][]>(); // θ → 시차별 원인 잔차
  for (const th of fixed ? [fixed.theta] : THETAS) {
    const a = adstock(driver.values.map((v) => v ?? 0), th);
    const base = extra ? null : residualize(a, dates);
    const perLag: (number | null)[][] = [];
    for (let L = 0; L <= MAX_LAG; L++) {
      const xr = extra ? residualize(lagged(a, L), dates, true, extra) : lagged(base!, L);
      perLag.push(xr);
      const { r, n } = pearson(xr, yr);
      if (r == null || (fixed && L !== fixed.lag)) continue;
      if (!best || Math.abs(r) > Math.abs(best.r)) best = { r, lag: L, theta: th, n, ar: xr };
    }
    byTheta.set(th, perLag);
  }
  if (!best) {
    return { driver: driver.key, outcome: outcome.key, r: null, lag: 0, theta: 0, n: 0, nEff: 0, p: 1, strength: "none", profile: [], rCrit: 1 };
  }
  const rhoX = lag1(best.ar);
  const nEff = Math.max(4, Math.min(best.n, (best.n * (1 - rhoX * rhoY)) / (1 + rhoX * rhoY)));
  const df = nEff - 2;
  const t = best.r * Math.sqrt(df / Math.max(1e-9, 1 - best.r * best.r));
  const multi = fixed ? 1 : MULTI; // 고정 검정은 한 번만 시험
  const p = Math.min(1, tPValue(t, df) * multi);
  // 보정 후 5% 경계 r: 이분 탐색
  let lo = 0;
  let hi = 0.999;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const tt = mid * Math.sqrt(df / (1 - mid * mid));
    if (tPValue(tt, df) * multi > 0.05) lo = mid;
    else hi = mid;
  }
  const perLag = byTheta.get(best.theta)!;
  const profile = perLag.map((xr, L) => ({ lag: L, r: pearson(xr, yr).r }));
  return { driver: driver.key, outcome: outcome.key, r: best.r, lag: best.lag, theta: best.theta, n: best.n, nEff, p, strength: strengthOf(p, best.r), profile, rCrit: hi };
}

// ── 회귀 기여도 ───────────────────────────────────────
export type Contribution = {
  driver: string;
  lag: number;
  theta: number;
  perUnit: number; // 원인 1단위(광고비면 1만 원, 노출이면 1,000회)당 결과
  perUnitLo: number;
  perUnitHi: number;
  total: number; // 기간 기여분
  totalLo: number;
  totalHi: number;
  share: number; // 결과 합계 대비
  driverTotal: number; // 같은 행 범위의 원인 합계
  confirmed: boolean; // 90% 구간이 0보다 큼
};

export type RegressionResult = {
  outcome: string;
  n: number;
  r2: number;
  r2Base: number; // 요일·추세(+통제 변수)만
  outcomeTotal: number;
  contributions: Contribution[];
};

export function regress(drivers: Series[], outcome: Series, dates: string[], picks: Record<string, { lag: number; theta: number }>, unitScale: number, extra?: Extra): RegressionResult | null {
  if (!outcome.additive || !drivers.length) return null;
  const start = Math.max(0, ...drivers.map((d) => picks[d.key]?.lag ?? 0));
  const cols = drivers.map((d) => {
    const pk = picks[d.key] ?? { lag: 0, theta: 0.3 };
    return lagged(adstock(d.values.map((v) => v ?? 0), pk.theta), pk.lag) as (number | null)[];
  });
  const rowIdx: number[] = [];
  for (let i = start; i < dates.length; i++) {
    const y = outcome.values[i];
    if (y == null || !Number.isFinite(y)) continue;
    if (cols.some((c) => c[i] == null)) continue;
    rowIdx.push(i);
  }
  const base = controls(dates, 0, true, extra).length;
  const k = drivers.length;
  if (rowIdx.length < base + k + 10) return null;

  // 원인 열은 표준화 후 릿지(λ=1) — 예산이 같이 움직일 때 계수가 튀는 것을 줄인다
  const mean = cols.map((c) => rowIdx.reduce((s, i) => s + (c[i] as number), 0) / rowIdx.length);
  const sd = cols.map((c, j) => Math.sqrt(rowIdx.reduce((s, i) => s + ((c[i] as number) - mean[j]) ** 2, 0) / rowIdx.length) || 1);
  const X = rowIdx.map((i) => [...controls(dates, i, true, extra), ...cols.map((c, j) => ((c[i] as number) - mean[j]) / sd[j])]);
  const y = rowIdx.map((i) => outcome.values[i] as number);
  const p = base + k;
  const lam = 1;
  const XtX = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => X.reduce((s, r) => s + r[a] * r[b], 0)));
  const A = XtX.map((row, a) => row.map((v, b) => v + (a === b ? (a >= base ? lam : 1e-6) : 0)));
  const Xty = Array.from({ length: p }, (_, a) => X.reduce((s, r, i) => s + r[a] * y[i], 0));
  const beta = solve(A, Xty);
  const Ainv = invert(A);
  if (!beta || !Ainv) return null;
  const fitted = X.map((r) => r.reduce((s, v, j) => s + v * beta[j], 0));
  const resid = y.map((v, i) => v - fitted[i]);
  const ybar = y.reduce((s, v) => s + v, 0) / y.length;
  const sst = y.reduce((s, v) => s + (v - ybar) ** 2, 0) || 1;
  const sse = resid.reduce((s, v) => s + v * v, 0);
  const r2 = 1 - sse / sst;
  const sigma2 = sse / Math.max(1, y.length - p);
  // 릿지 공분산(샌드위치): σ² A⁻¹ XᵀX A⁻¹, 잔차 자기상관만큼 부풀림
  const rho = Math.max(0, lag1(resid));
  const inflate = (1 + rho) / (1 - rho);
  const cov = (a: number) => {
    let s = 0;
    for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) s += Ainv[a][i] * XtX[i][j] * Ainv[j][a];
    return s * sigma2 * inflate;
  };

  const baseOnly = residualize(outcome.values.map((v, i) => (rowIdx.includes(i) ? v : null)), dates, true, extra);
  const sseBase = rowIdx.reduce((s, i) => s + (baseOnly[i] as number) ** 2, 0);
  const outcomeTotal = y.reduce((s, v) => s + v, 0);

  const contributions: Contribution[] = drivers.map((d, j) => {
    const bStd = beta[base + j];
    const se = Math.sqrt(Math.max(0, cov(base + j)));
    const b = bStd / sd[j]; // 원 단위 adstock 1당 결과
    const bLo = (bStd - 1.645 * se) / sd[j];
    const bHi = (bStd + 1.645 * se) / sd[j];
    const pk = picks[d.key] ?? { lag: 0, theta: 0.3 };
    const aSum = rowIdx.reduce((s, i) => s + (cols[j][i] as number), 0);
    const driverTotal = rowIdx.reduce((s, i) => s + (d.values[i - pk.lag] ?? 0), 0);
    // 기여 = 계수 × (adstock 합) — '원인이 0이었다면'과의 차이
    const total = b * aSum;
    const mult = 1 / (1 - pk.theta); // 1원이 남기는 총 adstock
    return {
      driver: d.key,
      lag: pk.lag,
      theta: pk.theta,
      perUnit: b * mult * unitScale,
      perUnitLo: bLo * mult * unitScale,
      perUnitHi: bHi * mult * unitScale,
      total,
      totalLo: bLo * aSum,
      totalHi: bHi * aSum,
      share: outcomeTotal > 0 ? total / outcomeTotal : 0,
      driverTotal,
      confirmed: bLo > 0,
    };
  });
  return { outcome: outcome.key, n: rowIdx.length, r2, r2Base: 1 - sseBase / sst, outcomeTotal, contributions };
}

// ── 집행일 vs 미집행일 ─────────────────────────────────
export type OnOff = { driver: string; outcome: string; onDays: number; offDays: number; onMean: number; offMean: number; diffPct: number | null; p: number };

export function onOff(driver: Series, outcome: Series, dates: string[], lag: number): OnOff | null {
  const pos = driver.values.filter((v): v is number => (v ?? 0) > 0).sort((a, b) => a - b);
  if (pos.length < 5) return null;
  const median = pos[Math.floor(pos.length / 2)];
  // 요일 효과만 걷고 수준은 유지(추세는 두지 않음 — 집행 기간 자체가 추세와 겹칠 수 있음)
  const resid = residualize(outcome.values, dates, false);
  const vals = outcome.values.filter((v): v is number => v != null && Number.isFinite(v));
  const level = vals.reduce((s, v) => s + v, 0) / Math.max(1, vals.length);
  const on: number[] = [];
  const off: number[] = [];
  for (let i = lag; i < dates.length; i++) {
    const x = driver.values[i - lag] ?? 0;
    const y = resid[i];
    if (y == null) continue;
    if (x >= median * 0.2 && x > 0) on.push(y + level);
    else if (x === 0) off.push(y + level);
  }
  if (on.length < 5 || off.length < 5) return null;
  const m = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const v = (a: number[], mu: number) => a.reduce((s, x) => s + (x - mu) ** 2, 0) / Math.max(1, a.length - 1);
  const onMean = m(on);
  const offMean = m(off);
  const se = Math.sqrt(v(on, onMean) / on.length + v(off, offMean) / off.length);
  const t = se > 0 ? (onMean - offMean) / se : 0;
  const df = Math.max(2, Math.min(on.length, off.length) - 1);
  return { driver: driver.key, outcome: outcome.key, onDays: on.length, offDays: off.length, onMean, offMean, diffPct: offMean !== 0 ? (onMean - offMean) / Math.abs(offMean) : null, p: tPValue(t, df) };
}

// 원인 광고비와 성과 캠페인 광고비가 같이 움직였는지(같이 늘리고 줄였다면 효과 분리가 어렵다)
export function coMovement(driver: Series, perfCost: number[], dates: string[]): number | null {
  return pearson(residualize(driver.values, dates), residualize(perfCost, dates)).r;
}

// 시차까지 본 동반 증감 — 원인을 늘리고 0~14일 안에 성과 예산도 늘렸는지(가장 강한 시차). 같은 날만 보면 '인지 먼저 → 며칠 뒤 성과 증액'을 놓친다
export function coMovementLag(driver: Series, perfCost: number[], dates: string[]): { r: number; lag: number } | null {
  const pc = residualize(perfCost, dates);
  const dr = residualize(driver.values, dates);
  let best: { r: number; lag: number } | null = null;
  for (let L = 0; L <= MAX_LAG; L++) {
    const { r } = pearson(lagged(dr, L), pc);
    if (r != null && (!best || Math.abs(r) > Math.abs(best.r))) best = { r, lag: L };
  }
  return best;
}

// 행사 기간 입력 → 날짜별 0/1. "2026-08-31~2026-09-06, 9/28~10/3" (연도 생략 시 분석 기간의 연도)
export function parsePromoRanges(text: string, dates: string[]): { dummy: number[] | null; days: number; error?: string } {
  const t = text.trim();
  if (!t) return { dummy: null, days: 0 };
  const years = [...new Set(dates.map((d) => d.slice(0, 4)))];
  const toIso = (raw: string): string | null => {
    const s = raw.trim();
    let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})[./](\d{1,2})$/);
    if (m) {
      const md = `${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
      const y = years.find((yy) => dates.includes(`${yy}-${md}`)) ?? years[0];
      return `${y}-${md}`;
    }
    return null;
  };
  const dummy = dates.map(() => 0);
  for (const part of t.split(/[,\n]+/).map((x) => x.trim()).filter(Boolean)) {
    const [a, b] = part.split(/\s*~\s*/);
    const s = toIso(a ?? "");
    const e = toIso(b ?? a ?? "");
    if (!s || !e) return { dummy: null, days: 0, error: `날짜를 읽지 못했어요: "${part}" — 예: 2026-08-31~2026-09-06 또는 9/28~10/3` };
    dates.forEach((d, i) => {
      if (d >= s && d <= e) dummy[i] = 1;
    });
  }
  const days = dummy.filter((v) => v).length;
  if (!days) return { dummy: null, days: 0, error: "입력한 기간이 분석 기간과 겹치지 않아요." };
  return { dummy, days };
}

// ── 외부 지표 CSV ─────────────────────────────────────
// 첫 열 날짜(2026-09-01 / 2026.09.01 / 20260901 / 9/1/2026), 나머지 열 숫자. 비어 있는 날은 직전 값으로 채움(주간 GRP 등).
export function parseExternalCsv(text: string, dates: string[]): { series: Series[]; error?: string } {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 3) return { series: [], error: "행이 너무 적어요(머리글 + 2행 이상)." };
  const sep = lines[0].includes("\t") ? "\t" : ",";
  const head = lines[0].split(sep).map((s) => s.trim().replace(/^"|"$/g, ""));
  const toIso = (s: string): string | null => {
    const t = s.trim().replace(/^"|"$/g, "");
    let m = t.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = t.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    return null;
  };
  const idx = new Map(dates.map((d, i) => [d, i]));
  const cols = head.slice(1).map(() => dates.map(() => null as number | null));
  let matched = 0;
  for (const line of lines.slice(1)) {
    const cells = line.split(sep);
    const iso = toIso(cells[0] ?? "");
    if (!iso) continue;
    const i = idx.get(iso);
    if (i == null) continue;
    matched++;
    cells.slice(1).forEach((c, j) => {
      const v = Number(String(c).replace(/[",%\s]/g, ""));
      if (j < cols.length && c.trim() !== "" && Number.isFinite(v)) cols[j][i] = v;
    });
  }
  if (!matched) return { series: [], error: "분석 기간과 겹치는 날짜가 없어요. 첫 열이 날짜인지 확인해 주세요." };
  const series = cols
    .map((vals, j) => {
      let last: number | null = null;
      const filled = vals.map((v) => (v != null ? (last = v) : last));
      return { key: `ext_${j}_${head[j + 1]}`, label: head[j + 1] || `외부 지표 ${j + 1}`, values: filled, unit: "index" as Unit, external: true, additive: false };
    })
    .filter((s) => s.values.filter((v) => v != null).length >= 14);
  if (!series.length) return { series: [], error: "숫자 값이 14일 이상 있는 열이 없어요." };
  return { series };
}
