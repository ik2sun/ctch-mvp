// 인지·영상 캠페인 판단 근거 — 순수 함수(API 비용 없음).
//
// 인지 캠페인은 자기 ROAS로 평가하지 않는다(구매 전환을 목표로 최적화하지 않으니 낮게 나오는 게 정상).
// 대신 세 가지로 본다.
//   ① 전달 효율 — 비교 그룹 대비 CPM·도달 1천 명당 비용, 빈도(메타)
//   ② 주목도   — 노출 대비 영상 재생률(메타 3초·GFA 재생·구글 TrueView 조회)·ThruPlay율(메타)
//   ①+② 종합 효율 — 영상 역할 = 조회 1회당 비용, 도달·인지 역할 = 도달 1천 명당 비용(없으면 CPM). 판단은 이 값으로 한다
//      (싸게 닿지만 안 보는 캠페인, 비싸도 끝까지 보는 캠페인을 한 숫자로 비교하기 위해)
//   ③ 하위 퍼널 신호 — 그 역할(도달·인지 / 영상) 광고비와 브랜드검색 클릭·검색광고 클릭·성과 캠페인 전환이
//                    시차를 두고 함께 움직였는지(상관·회귀·집행일 비교). 시계열은 역할 단위라 캠페인별로는 못 나눈다.
// 비교 그룹 = 같은 매체 × 같은 역할 × 같은 매체 목표(구글은 채널 유형 — VRC·디맨드젠·VVC 단가가 원래 달라서).
// 광고주 자기 캠페인끼리 비교(업계 평균이 아님). 그룹에 다른 캠페인이 없으면 '비교 대상 없음'.
import type { LagResult, OnOff, RegressionResult, Series } from "./analysis";
import { ROLE_META, type CorrCampaign, type Role } from "./types";

export const AWARENESS_ROLES = ["awareness", "video"] as const;
export type AwarenessRole = (typeof AWARENESS_ROLES)[number];

// 하위 퍼널 신호로 보는 결과 — 앞일수록 인지 효과에 가까운 지표
export const SIGNAL_OUTCOMES = ["brand_clicks", "search_clicks", "perf_conv", "perf_rev"] as const;

// 운영 기준(내부 비교) — 같은 매체 인지·영상 캠페인 중앙값 대비
const CHEAP = 0.8; // CPM이 중앙값의 80% 이하면 '싸게 닿음'
const PRICEY = 1.25; // 125% 이상이면 '비쌈'
const ATTENTIVE = 1.2; // 재생률이 중앙값의 120% 이상이면 '잘 봄'
const IGNORED = 0.8;
const WEEKLY_FREQ_HIGH = 3; // 7일 환산 빈도 3회 이상이면 같은 사람에게 반복 노출이 많음

export type Level = "good" | "bad" | "neutral" | "unknown";

export type AwarenessRow = {
  id: string;
  media: string;
  name: string;
  role: AwarenessRole;
  days: number;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  cpm: number | null;
  ctr: number | null;
  reach: number | null;
  frequency: number | null;
  weeklyFreq: number | null;
  costPerReach1k: number | null;
  viewRate: number | null; // 3초 재생(GFA는 재생) ÷ 노출
  thruRate: number | null; // ThruPlay ÷ 노출(메타)
  costPerView: number | null;
  peers: number; // 비교 그룹 캠페인 수(자기 제외)
  cpmVsPeer: number | null;
  viewVsPeer: number | null;
  effLabel: string; // 종합 효율 지표 이름
  eff: number | null;
  effVsPeer: number | null;
  delivery: Level; // ① 전달 효율(CPM)
  attention: Level; // ② 주목도(재생률)
  efficiency: Level; // ①+② 종합 — 판단에 쓰는 값
  signal: Level; // ③ 하위 퍼널(역할 단위)
  verdict: { tone: "good" | "warn" | "bad" | "muted"; label: string; text: string };
  notes: string[];
};

export type RoleSignal = {
  role: AwarenessRole;
  outcomeKey: string;
  outcomeLabel: string;
  r: number | null;
  lag: number;
  strength: LagResult["strength"];
  positive: boolean; // 뚜렷함·있음 + 양의 상관
  negative: boolean;
  confirmed: boolean; // 회귀 90% 구간 > 0
  perUnit: number | null;
  onOffPct: number | null;
  onOffSig: boolean;
  unit: Series["unit"];
  noun?: string;
};

const ratio = (v: number | null) => (v == null ? "" : `${Math.abs(Math.round((v - 1) * 100))}%`);
const median = (xs: number[]) => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// 역할별 하위 퍼널 신호 — 매트릭스 셀·회귀·집행일 비교 결과를 모은다
export function roleSignals(
  outcomes: Series[],
  cells: Record<string, LagResult>,
  regressions: Record<string, RegressionResult | null>,
  onoffs: Record<string, Record<string, OnOff | null>>,
): Record<AwarenessRole, RoleSignal[]> {
  const out = { awareness: [], video: [] } as Record<AwarenessRole, RoleSignal[]>;
  for (const role of AWARENESS_ROLES) {
    for (const key of SIGNAL_OUTCOMES) {
      const o = outcomes.find((x) => x.key === key);
      const c = cells[`${role}|${key}`];
      if (!o || !c) continue;
      const reg = regressions[key]?.contributions.find((x) => x.driver === role);
      const oo = onoffs[key]?.[role] ?? null;
      const sig = c.strength === "strong" || c.strength === "moderate";
      out[role].push({
        role,
        outcomeKey: key,
        outcomeLabel: o.label,
        r: c.r,
        lag: c.lag,
        strength: c.strength,
        positive: sig && (c.r ?? 0) > 0,
        negative: sig && (c.r ?? 0) < 0,
        confirmed: !!reg?.confirmed,
        perUnit: reg ? reg.perUnit : null,
        onOffPct: oo?.diffPct ?? null,
        onOffSig: !!oo && oo.p < 0.05 && (oo.diffPct ?? 0) > 0,
        unit: o.unit,
        noun: o.noun,
      });
    }
  }
  return out;
}

function signalLevel(list: RoleSignal[] | undefined, hasSeries: boolean): Level {
  if (!hasSeries || !list?.length) return "unknown";
  if (list.some((s) => s.confirmed || (s.positive && s.onOffSig))) return "good";
  if (list.some((s) => s.positive)) return "good";
  if (list.some((s) => s.negative)) return "bad";
  return "neutral";
}

export function awarenessRows(
  campaigns: CorrCampaign[],
  roles: Record<string, Role>,
  days: number,
  signals: Record<AwarenessRole, RoleSignal[]>,
  driverKeys: Set<string>, // 시계열로 쓰인 역할(집행일 5일 이상)
  coMove: Record<string, number | null> = {}, // 역할 광고비 ↔ 성과 캠페인 광고비 잔차 상관(0.7 이상이면 분리 불가)
): AwarenessRow[] {
  const base = campaigns
    .filter((c) => (AWARENESS_ROLES as readonly string[]).includes(roles[c.id]))
    .map((c) => {
      const s = c.daily.reduce(
        (a, d) => ({
          cost: a.cost + d.cost,
          imps: a.imps + d.impressions,
          clicks: a.clicks + d.clicks,
          conv: a.conv + d.conversions,
          rev: a.rev + d.revenue,
          views: a.views + (d.videoViews ?? 0),
        }),
        { cost: 0, imps: 0, clicks: 0, conv: 0, rev: 0, views: 0 },
      );
      const t = c.totals;
      const reach = t?.reach ? t.reach : null;
      const frequency = t?.frequency ? t.frequency : reach && s.imps ? s.imps / reach : null;
      return {
        c,
        s,
        role: roles[c.id] as AwarenessRole,
        days: c.daily.filter((d) => d.cost > 0).length,
        cpm: s.imps >= 1000 ? (s.cost / s.imps) * 1000 : null,
        reach,
        frequency,
        viewRate: s.views > 0 && s.imps > 0 ? s.views / s.imps : null,
        thruRate: t?.thruplays && s.imps ? t.thruplays / s.imps : null,
        costPerView: s.views > 0 ? s.cost / s.views : null,
      };
    })
    .map((x) => {
      // 종합 효율: 영상 = 조회당 비용, 도달·인지 = 도달 1천 명당 비용 → CPM
      const perReach = x.reach && x.s.cost ? (x.s.cost / x.reach) * 1000 : null;
      const [effLabel, eff]: [string, number | null] =
        x.role === "video" && x.costPerView != null ? ["조회 1회당 비용", x.costPerView] : perReach != null ? ["도달 1천 명당 비용", perReach] : ["CPM", x.cpm];
      return { ...x, perReach, effLabel, eff };
    })
    .filter((x) => x.s.cost > 0 || x.s.imps > 0);

  return base
    .map((x) => {
      const peers = base.filter((p) => p.c.media === x.c.media && p.role === x.role && (p.c.objective ?? "") === (x.c.objective ?? "") && p.c.id !== x.c.id);
      const pc = median(peers.map((p) => p.cpm ?? NaN));
      const pv = median(peers.map((p) => p.viewRate ?? NaN));
      const pe = median(peers.filter((p) => p.effLabel === x.effLabel).map((p) => p.eff ?? NaN));
      const cpmVsPeer = x.cpm != null && pc ? x.cpm / pc : null;
      const viewVsPeer = x.viewRate != null && pv ? x.viewRate / pv : null;
      const effVsPeer = x.eff != null && pe ? x.eff / pe : null;
      const weeklyFreq = x.frequency != null && x.days > 0 ? x.frequency / Math.max(1, Math.min(days, x.days) / 7) : null;

      const delivery: Level = cpmVsPeer == null ? "unknown" : cpmVsPeer <= CHEAP ? "good" : cpmVsPeer >= PRICEY ? "bad" : "neutral";
      const attention: Level = viewVsPeer == null ? "unknown" : viewVsPeer >= ATTENTIVE ? "good" : viewVsPeer <= IGNORED ? "bad" : "neutral";
      const efficiency: Level = effVsPeer == null ? "unknown" : effVsPeer <= CHEAP ? "good" : effVsPeer >= PRICEY ? "bad" : "neutral";
      const tangled = Math.abs(coMove[x.role] ?? 0) >= 0.7;
      const signal = tangled ? "unknown" : signalLevel(signals[x.role], driverKeys.has(x.role));

      const notes: string[] = [];
      if (weeklyFreq != null && weeklyFreq >= WEEKLY_FREQ_HIGH) notes.push(`7일 환산 빈도 ${weeklyFreq.toFixed(1)}회 — 같은 사람에게 반복 노출이 많아요(도달 확장·소재 교체 검토)`);
      if (peers.length === 0) notes.push("비교 그룹(같은 매체·역할·목표)에 다른 캠페인이 없어 효율은 판단 보류");
      if (delivery === "good" && attention === "bad") notes.push("싸게 닿지만 재생률이 낮아요 — 첫 3초 훅·지면 확인");
      if (delivery === "bad" && attention === "good")
        notes.push(x.role === "video" ? "비싸게 닿지만 더 오래 보는 편이에요 — 조회당 비용으로 판단" : "단가는 높지만 재생률이 높아요 — 브랜드 검색 반응과 함께 판단");
      if (tangled) notes.push(`${ROLE_META[x.role].label} 광고비가 성과 캠페인 광고비와 거의 같이 움직여(r ${(coMove[x.role] ?? 0).toFixed(2)}) 하위 퍼널 효과를 따로 떼어 볼 수 없어요`);

      const bad = efficiency === "bad";
      const good = efficiency === "good";
      const roleLabel = ROLE_META[x.role].label;
      let verdict: AwarenessRow["verdict"];
      if (signal === "good" && !bad)
        verdict = { tone: "good", label: "근거 있음", text: `${roleLabel} 광고비와 하위 퍼널 지표가 함께 움직였고 ${x.effLabel}도 비교 그룹 수준이에요 — 유지·확대 검토` };
      else if (signal === "good" && bad)
        verdict = { tone: "warn", label: "효율 점검", text: `하위 퍼널 신호는 있지만 ${x.effLabel}이 비교 그룹보다 ${ratio(effVsPeer)} 비싸요 — 타겟·지면·소재 점검` };
      else if (signal === "bad")
        verdict = { tone: "warn", label: "반대 신호", text: `${roleLabel} 광고비가 늘 때 하위 퍼널 지표가 줄었어요 — 성과 캠페인 예산을 빼서 쓴 건 아닌지 확인` };
      else if (signal === "unknown")
        verdict = {
          tone: "muted",
          label: "판단 보류",
          text: tangled ? "성과 캠페인 예산과 함께 늘고 줄어 효과를 분리할 수 없어요 — 한쪽만 바꾸는 기간을 두고 다시 보세요" : "집행일이 5일 미만이거나 결과 지표(검색·전환 캠페인)가 없어 하위 퍼널 신호를 볼 수 없어요",
        };
      else if (good && !bad)
        verdict = { tone: "muted", label: "전달만 확인", text: "싸게·잘 닿고 있지만 하위 퍼널 신호는 이 기간에 안 보여요 — 기간을 늘리거나 켰다 끄기 테스트로 확인" };
      else if (bad)
        verdict = { tone: "bad", label: "근거 부족", text: `${x.effLabel}이 비교 그룹보다 ${ratio(effVsPeer)} 비싸고 하위 퍼널 신호도 없어요 — 축소하거나 타겟·소재를 바꿔 다시 테스트` };
      else verdict = { tone: "muted", label: "신호 없음", text: "전달 효율은 평균 수준, 하위 퍼널 신호는 이 기간에 안 보여요 — 켰다 끄기 테스트로 확인 권장" };

      return {
        id: x.c.id,
        media: x.c.media,
        name: x.c.name,
        role: x.role,
        days: x.days,
        cost: x.s.cost,
        impressions: x.s.imps,
        clicks: x.s.clicks,
        conversions: x.s.conv,
        revenue: x.s.rev,
        cpm: x.cpm,
        ctr: x.s.imps ? x.s.clicks / x.s.imps : null,
        reach: x.reach,
        frequency: x.frequency,
        weeklyFreq,
        costPerReach1k: x.perReach,
        viewRate: x.viewRate,
        thruRate: x.thruRate,
        costPerView: x.costPerView,
        peers: peers.length,
        cpmVsPeer,
        viewVsPeer,
        effLabel: x.effLabel,
        eff: x.eff,
        effVsPeer,
        delivery,
        attention,
        efficiency,
        signal,
        verdict,
        notes,
      } satisfies AwarenessRow;
    })
    .sort((a, b) => b.cost - a.cost);
}
