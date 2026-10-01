// 대시보드 매체 효율 계산·인사이트 — 순수 함수(화면·API 공용). 수치는 매체 API가 준 값만 쓰고 추정하지 않는다.
import type { DailyPoint, Totals } from "@/features/ai-report/metaTypes";

// 매체 색 — dataviz 기본 범주 팔레트 순서 그대로(흰 카드 표면 기준 검증 통과: 인접 CVD ΔE ≥ 9.1, 정상시 ΔE ≥ 19.6).
// 색은 매체에 고정(필터로 매체가 빠져도 남은 매체 색이 바뀌지 않음). 노랑·청록·분홍은 흰 배경 대비 3:1 미만이라 항상 라벨·표와 함께 쓴다.
export const MEDIA_COLORS: Record<string, string> = {
  meta: "#2a78d6",
  naver: "#eb6834",
  gfa: "#1baf7a",
  kakao: "#eda100",
  google_ads: "#e87ba4",
};

export type MediaSeries = {
  key: string;
  label: string;
  color: string;
  current: Totals;
  previous: Totals | null; // 비교 기준(직전 기간 또는 전월 동기간)
  daily: DailyPoint[];
  dailyApprox?: boolean;
};

export const ZERO: Totals = { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, reach: 0, frequency: 0 };

export function sumTotals(list: Totals[]): Totals {
  const out = list.reduce(
    (a, t) => ({
      impressions: a.impressions + t.impressions,
      clicks: a.clicks + t.clicks,
      cost: a.cost + t.cost,
      conversions: a.conversions + t.conversions,
      revenue: a.revenue + t.revenue,
      reach: 0,
      frequency: 0,
    }),
    { ...ZERO },
  );
  // 장바구니는 제공하는 매체만 — 하나도 없으면 undefined로 둬서 "—"로 보이게
  const carts = list.map((t) => t.addToCart).filter((v): v is number => v != null);
  return carts.length ? { ...out, addToCart: carts.reduce((a, b) => a + b, 0) } : out;
}

export type Ratios = { roas: number | null; cpa: number | null; ctr: number | null; cvr: number | null; cpc: number | null };

export function ratios(t: Totals): Ratios {
  return {
    roas: t.cost > 0 ? t.revenue / t.cost : null,
    cpa: t.conversions > 0 ? t.cost / t.conversions : null,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : null,
    cvr: t.clicks > 0 ? t.conversions / t.clicks : null,
    cpc: t.clicks > 0 ? t.cost / t.clicks : null,
  };
}

// 증감률(%) — 기준값이 없거나 0이면 null
export function change(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

// 일자별로 매체 daily를 합친 행 — 차트용 { date, [key]: value }
export function mergeDaily(series: MediaSeries[], pick: (d: DailyPoint) => number): Record<string, number | string>[] {
  const byDate = new Map<string, Record<string, number | string>>();
  for (const s of series) {
    for (const d of s.daily) {
      const row = byDate.get(d.date) ?? { date: d.date };
      row[s.key] = pick(d);
      byDate.set(d.date, row);
    }
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function combinedDaily(series: MediaSeries[]): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>();
  for (const s of series) {
    for (const d of s.daily) {
      const r = byDate.get(d.date) ?? { date: d.date, impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0 };
      r.impressions += d.impressions;
      r.clicks += d.clicks;
      r.cost += d.cost;
      r.conversions += d.conversions;
      r.revenue += d.revenue;
      byDate.set(d.date, r);
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export type MediaEfficiency = {
  series: MediaSeries;
  spendShare: number; // 0~1
  revenueShare: number; // 0~1
  convShare: number;
  cur: Ratios;
  prev: Ratios | null;
  costChange: number | null;
  revenueChange: number | null;
  roasChange: number | null;
  cpaChange: number | null;
};

export function efficiency(series: MediaSeries[]): { rows: MediaEfficiency[]; total: Totals; totalPrev: Totals | null } {
  const total = sumTotals(series.map((s) => s.current));
  const prevs = series.map((s) => s.previous);
  const totalPrev = prevs.every(Boolean) && prevs.length ? sumTotals(prevs as Totals[]) : null;
  const rows = series.map((s) => {
    const cur = ratios(s.current);
    const prev = s.previous ? ratios(s.previous) : null;
    return {
      series: s,
      spendShare: total.cost > 0 ? s.current.cost / total.cost : 0,
      revenueShare: total.revenue > 0 ? s.current.revenue / total.revenue : 0,
      convShare: total.conversions > 0 ? s.current.conversions / total.conversions : 0,
      cur,
      prev,
      costChange: change(s.current.cost, s.previous?.cost ?? null),
      revenueChange: change(s.current.revenue, s.previous?.revenue ?? null),
      roasChange: change(cur.roas, prev?.roas ?? null),
      cpaChange: change(cur.cpa, prev?.cpa ?? null),
    };
  });
  return { rows, total, totalPrev };
}

export type InsightTone = "good" | "warn" | "bad" | "info";
export type Insight = { id: string; tone: InsightTone; title: string; detail: string; mediaKey?: string; weight: number };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const pctPt = (v: number) => `${(v * 100).toFixed(0)}%p`;
const chg = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}%`;
const won = (v: number) => `₩${Math.round(v).toLocaleString("ko-KR")}`;

// 규칙 기반 인사이트 — 데이터로 확인되는 신호만. 원인 추정 문장은 넣지 않는다.
export function buildInsights(rows: MediaEfficiency[], total: Totals, totalPrev: Totals | null, compareLabel: string, noun = "매체"): Insight[] {
  const out: Insight[] = [];
  const blended = ratios(total);
  const active = rows.filter((r) => r.series.current.cost > 0);

  // 데이터 이상 — 클릭은 있는데 광고비 0, 광고비는 있는데 전환·매출 0
  for (const r of rows) {
    const c = r.series.current;
    if (c.cost === 0 && c.clicks > 0) {
      out.push({
        id: `zero-cost-${r.series.key}`,
        tone: "warn",
        title: `${r.series.label} 광고비가 0원으로 집계돼요`,
        detail: `클릭 ${c.clicks.toLocaleString("ko-KR")}회가 있는데 비용이 0원이에요. 비용 데이터(권한·필드)를 확인해야 ROAS·CPA를 믿을 수 있어요.`,
        mediaKey: r.series.key,
        weight: 90,
      });
    } else if (c.cost > 0 && c.conversions === 0 && c.revenue === 0) {
      out.push({
        id: `no-conv-${r.series.key}`,
        tone: "warn",
        title: `${r.series.label} 전환·매출이 0이에요`,
        detail: `${won(c.cost)}을 썼는데 전환이 잡히지 않았어요. 전환 추적(픽셀·전환 설정)이 연결돼 있는지 먼저 확인하세요.`,
        mediaKey: r.series.key,
        weight: 80,
      });
    }
  }

  // 전체 — 광고비는 늘었는데 매출이 줄었을 때
  if (totalPrev) {
    const costC = change(total.cost, totalPrev.cost);
    const revC = change(total.revenue, totalPrev.revenue);
    if (costC != null && revC != null) {
      if (costC > 10 && revC < 0) {
        out.push({
          id: "blend-cost-up-rev-down",
          tone: "bad",
          title: "광고비는 늘었는데 매출은 줄었어요",
          detail: `${compareLabel} 광고비 ${chg(costC)}, 매출 ${chg(revC)}. 매체별 ROAS 변화에서 하락한 매체를 먼저 보세요.`,
          weight: 85,
        });
      } else if (revC - costC > 15) {
        out.push({
          id: "blend-eff-up",
          tone: "good",
          title: "전체 효율이 좋아졌어요",
          detail: `${compareLabel} 광고비 ${chg(costC)}, 매출 ${chg(revC)} — 쓴 돈보다 매출이 더 많이 늘었어요.`,
          weight: 40,
        });
      }
    }
  }

  // 매체별 전기간 대비 급변
  for (const r of active) {
    if (r.roasChange != null && r.series.previous && r.series.previous.cost > 0) {
      if (r.roasChange <= -20) {
        out.push({
          id: `roas-drop-${r.series.key}`,
          tone: "bad",
          title: `${r.series.label} ROAS ${chg(r.roasChange)}`,
          detail: `${compareLabel} ${pct(r.prev!.roas ?? 0)} → ${pct(r.cur.roas ?? 0)}. 광고비 ${r.costChange != null ? chg(r.costChange) : "—"}, 매출 ${r.revenueChange != null ? chg(r.revenueChange) : "—"}.`,
          mediaKey: r.series.key,
          weight: 70 + Math.min(20, Math.abs(r.roasChange) / 5) * (r.spendShare + 0.2),
        });
      } else if (r.roasChange >= 20) {
        out.push({
          id: `roas-up-${r.series.key}`,
          tone: "good",
          title: `${r.series.label} ROAS ${chg(r.roasChange)}`,
          detail: `${compareLabel} ${pct(r.prev!.roas ?? 0)} → ${pct(r.cur.roas ?? 0)}. 같은 소재·타깃으로 예산 확대 여지가 있는지 보세요.`,
          mediaKey: r.series.key,
          weight: 45 + r.spendShare * 10,
        });
      }
    }
    if (r.cpaChange != null && r.cpaChange >= 25 && r.series.current.conversions >= 5) {
      out.push({
        id: `cpa-up-${r.series.key}`,
        tone: "bad",
        title: `${r.series.label} CPA ${chg(r.cpaChange)}`,
        detail: `${compareLabel} ${won(r.prev!.cpa ?? 0)} → ${won(r.cur.cpa ?? 0)}. 전환 1건을 얻는 비용이 올랐어요.`,
        mediaKey: r.series.key,
        weight: 65 + r.spendShare * 10,
      });
    }
  }

  // 예산 비중 vs 매출 기여 — 매출이 집계되는 매체가 2개 이상일 때만
  if (active.filter((r) => r.series.current.revenue > 0).length >= 2 && total.revenue > 0) {
    for (const r of active) {
      const gap = r.revenueShare - r.spendShare;
      if (gap >= 0.1) {
        out.push({
          id: `share-under-${r.series.key}`,
          tone: "good",
          title: `${r.series.label} — 예산보다 매출 기여가 커요`,
          detail: `예산 비중 ${pct(r.spendShare)}인데 매출 기여 ${pct(r.revenueShare)}(+${pctPt(gap)}). 증액 우선 후보예요.`,
          mediaKey: r.series.key,
          weight: 55 + gap * 50,
        });
      } else if (gap <= -0.1) {
        out.push({
          id: `share-over-${r.series.key}`,
          tone: "warn",
          title: `${r.series.label} — 예산 대비 매출 기여가 작아요`,
          detail: `예산 비중 ${pct(r.spendShare)}인데 매출 기여 ${pct(r.revenueShare)}(${pctPt(gap)}). 효율 낮은 캠페인·소재를 끄거나 솎아내세요.`,
          mediaKey: r.series.key,
          weight: 60 + Math.abs(gap) * 50,
        });
      }
    }
  }

  // 최고 효율 매체(비교 대상 2개 이상, 예산 비중 5% 이상)
  const ranked = active.filter((r) => r.spendShare >= 0.05 && r.cur.roas != null).sort((a, b) => (b.cur.roas ?? 0) - (a.cur.roas ?? 0));
  if (ranked.length >= 2 && blended.roas) {
    const top = ranked[0];
    if (!out.some((i) => i.mediaKey === top.series.key && i.tone === "good")) {
      out.push({
        id: `top-${top.series.key}`,
        tone: "info",
        title: `가장 효율이 좋은 ${noun}: ${top.series.label}`,
        detail: `ROAS ${pct(top.cur.roas!)} — 전체 평균 ${pct(blended.roas)}의 ${((top.cur.roas ?? 0) / blended.roas).toFixed(1)}배예요.`,
        mediaKey: top.series.key,
        weight: 30,
      });
    }
  }

  // 한 매체가 목록을 독차지하지 않도록 매체당 최대 2개
  const perMedia = new Map<string, number>();
  return out
    .sort((a, b) => b.weight - a.weight)
    .filter((i) => {
      if (!i.mediaKey) return true;
      const n = (perMedia.get(i.mediaKey) ?? 0) + 1;
      perMedia.set(i.mediaKey, n);
      return n <= 2;
    })
    .slice(0, 6);
}

// 캠페인·그룹 행 → 시리즈. 광고비 상위 topN만 두고 나머지는 "기타 N개"로 접는다(색 없음 — 매체 색은 매체에만).
export function rowsToSeries(
  rows: { id: string; name: string; impressions: number; clicks: number; cost: number; conversions: number; revenue: number; daily?: DailyPoint[] }[],
  topN = 8,
): MediaSeries[] {
  const toTotals = (r: (typeof rows)[number]): Totals => ({ impressions: r.impressions, clicks: r.clicks, cost: r.cost, conversions: r.conversions, revenue: r.revenue, reach: 0, frequency: 0 });
  const sorted = [...rows].sort((a, b) => b.cost - a.cost || b.revenue - a.revenue);
  const head = sorted.slice(0, topN).map((r) => ({ key: r.id, label: r.name || r.id, color: "", current: toTotals(r), previous: null, daily: r.daily ?? [] }));
  const rest = sorted.slice(topN);
  if (rest.length) {
    head.push({ key: "__rest", label: `기타 ${rest.length}개`, color: "", current: sumTotals(rest.map(toTotals)), previous: null, daily: [] });
  }
  return head;
}

// 파일 분석 등 이름만 있는 매체 그룹 → 매체 키 추정. GFA(성과형)를 네이버보다 먼저 본다.
export function guessMediaKey(name: string): string | null {
  const n = name.toLowerCase().replace(/\s/g, "");
  if (/gfa|성과형|네이버디스플레이/.test(n)) return "gfa";
  if (/meta|facebook|페이스북|메타|instagram|인스타/.test(n)) return "meta";
  if (/naver|네이버|파워링크|쇼핑검색|검색광고/.test(n)) return "naver";
  if (/kakao|카카오|모먼트|다음/.test(n)) return "kakao";
  if (/google|구글|youtube|유튜브|gdn|pmax/.test(n)) return "google_ads";
  return null;
}

// 기본 팔레트 6~8번 슬롯 — 매체 5색 뒤에 이 순서로만 붙인다(검증된 순서). 그 뒤는 색 없음.
const EXTRA_SLOTS = ["#008300", "#4a3aa7", "#e34948"];

// 그룹 이름들 → 색. 같은 매체로 추정되는 그룹이 둘이면 두 번째부터는 남는 슬롯을 쓴다(색 = 개체, 중복 금지).
export function colorsForNames(names: string[]): Record<string, string> {
  const used = new Set<string>();
  const out: Record<string, string> = {};
  const pending: string[] = [];
  for (const name of names) {
    const k = guessMediaKey(name);
    const c = k ? MEDIA_COLORS[k] : null;
    if (c && !used.has(c)) {
      out[name] = c;
      used.add(c);
    } else pending.push(name);
  }
  const free = EXTRA_SLOTS.filter((c) => !used.has(c));
  for (const name of pending) out[name] = free.shift() ?? "";
  return out;
}
