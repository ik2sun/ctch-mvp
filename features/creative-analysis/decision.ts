// 소재 판정 엔진 — 순수 함수(화면 계산, API 비용 없음).
// 상태: 🟢 키우기 / 🟡 지켜보기 / 🔴 끄기 / 🌱 신규(학습 중) / 💤 예산 못 받음 + 이유 한 줄 + 신뢰도 + ROAS 90% 구간.
//
// 전환(CV) 소재 — 광고주 목표 ROAS(절대 기준, 기본 500%)와 비교. 캠페인 유형별 목표(프로모션·상시·브랜딩/TVC)가 있으면 그걸 쓴다.
//   · 신뢰 구간: 전환 수를 포아송으로 보고 ROAS 90% 구간 = ROAS × (1 ± 1.645/√전환). 주문 금액 편차는 반영 못 함(구간이 실제보다 좁을 수 있다).
//   · 키우기: 구간 하한 ≥ 목표(확실히 목표 이상) & 최근 3일 ROAS 30%↑ 꺾임·피로 없음
//   · 끄기:   구간 상한 < 목표(확실히 목표 미만), 또는 전환이 거의 없이 계정 CPA의 3배↑ 소진
//   · 지켜보기: 구간이 목표를 걸침(아직 구분 안 됨), 또는 좋지만 최근 꺾임·피로
//   · 신규:   전환 5건 미만 & 집행 7일 이하 — 기다리면 판단 가능
//   · 예산 못 받음: 전환 5건 미만 & 집행 8일 이상 — 메타가 예산을 안 줘서 데이터가 안 쌓임 → 정리 대상
// 트래픽(TR) 소재 — 같은 목표 소재들의 CTR 중앙값 대비(상대 기준).
// 광고세트 행동(adsetActions) — 메타 예산은 광고세트(ABO)·캠페인(CBO·Advantage+)에 있으니, 소재 판정을 세트 단위 행동으로 묶는다.
import type { Enriched } from "./analyze";
import type { AdsetSetting, CampaignSetting } from "./types";
import { facetValue } from "./groups";

export type DecisionStatus = "scale" | "watch" | "kill" | "new" | "starved";
export type CampaignKind = "promo" | "ongoing" | "brand" | "base";
export type TargetRules = Partial<Record<Exclude<CampaignKind, "base">, number>>;
export type Decision = {
  status: DecisionStatus;
  reason: string;
  confidence: "높음" | "보통" | "낮음";
  basis: "target" | "relative";
  target: number; // %
  kind: CampaignKind;
  interval: { low: number; high: number } | null; // ROAS(배수) 90% 구간
};

export const MIN_CONV = 5;
const Z = 1.645;
export const KIND_LABEL: Record<CampaignKind, string> = { promo: "프로모션", ongoing: "상시", brand: "브랜딩·TVC", base: "기본" };
export const STATUS_META: Record<DecisionStatus, { label: string; icon: string; chip: string; head: string }> = {
  kill: { label: "끄기", icon: "🔴", chip: "bg-bad/10 text-bad", head: "text-bad" },
  scale: { label: "키우기", icon: "🟢", chip: "bg-good/10 text-good", head: "text-good" },
  watch: { label: "지켜보기", icon: "🟡", chip: "bg-warn/10 text-warn", head: "text-warn" },
  starved: { label: "예산 못 받음", icon: "💤", chip: "bg-[#EEF0F3] text-ink-soft", head: "text-ink-soft" },
  new: { label: "신규", icon: "🌱", chip: "bg-canvas text-ink-muted", head: "text-ink-soft" },
};

const won = (v: number) => `₩${Math.round(v).toLocaleString("ko-KR")}`;
const pct = (v: number) => `${Math.round(v * 100).toLocaleString("ko-KR")}%`;

function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// 캠페인 유형 — UTM 규칙의 캠페인 유형 → UTM 캠페인 값 → 소재명(TVC) → 캠페인 이름 순
export function campaignKind(r: Enriched): CampaignKind {
  if (r.utmLabel?.kind) return r.utmLabel.kind;
  const utm = facetValue(r, "campaign");
  if (utm.startsWith("프로모션")) return "promo";
  if (utm.startsWith("상시")) return "ongoing";
  if (/tvc|branding|brand/i.test(utm) || r.parsed.type === "TVC" || /branding|tvc|브랜딩/i.test(r.campaignName)) return "brand";
  if (/promotion|pm_|프로모션/i.test(r.campaignName)) return "promo";
  if (/ongoing|상시/i.test(r.campaignName)) return "ongoing";
  return "base";
}

export const targetFor = (kind: CampaignKind, base: number, rules: TargetRules) => (kind !== "base" && rules[kind]) || base;

function interval(roas: number, conv: number) {
  const rel = Z / Math.sqrt(conv);
  return { low: roas * Math.max(0, 1 - rel), high: roas * (1 + rel), rel };
}
const confOf = (rel: number): Decision["confidence"] => (rel <= 0.3 ? "높음" : rel <= 0.52 ? "보통" : "낮음");

// 최근 3일 ROAS vs 그 전 — 일별 데이터가 있는 소재(광고비 상위)만. 최근 3일 광고비가 너무 적으면 판단 안 함
function roasTrend(r: Enriched): { recent: number; before: number } | null {
  const d = (r.daily ?? []).filter((p) => p.cost > 0);
  if (d.length < 6) return null;
  const tail = d.slice(-3);
  const head = d.slice(0, -3);
  const sum = (ps: typeof d, k: "cost" | "revenue") => ps.reduce((a, p) => a + p[k], 0);
  const tc = sum(tail, "cost");
  const hc = sum(head, "cost");
  if (tc < r.cost * 0.1 || hc <= 0) return null;
  return { recent: sum(tail, "revenue") / tc, before: sum(head, "revenue") / hc };
}

export function decide(rows: Enriched[], baseTarget: number, rules: TargetRules, fatiguedIds: Set<string>): Map<string, Decision> {
  const out = new Map<string, Decision>();
  const sales = rows.filter((r) => r.group === "sales");
  const conv = sales.reduce((a, r) => a + r.conversions, 0);
  const accountCpa = conv > 0 ? sales.reduce((a, r) => a + r.cost, 0) / conv : null;
  const upperCtr = median(rows.filter((r) => r.group === "upper" && r.judged && r.ctr != null).map((r) => r.ctr!));

  for (const r of rows) {
    const kind = campaignKind(r);
    const tPct = targetFor(kind, baseTarget, rules);
    const target = tPct / 100;
    const age = r.ageDays ?? 0;
    const base = { target: tPct, kind };

    if (r.group === "upper") {
      if (!r.judged || r.ctr == null || upperCtr == null) {
        out.set(r.id, { ...base, status: age > 7 ? "starved" : "new", reason: age > 7 ? `집행 ${age}일째인데 노출이 판단 기준보다 적어요` : "노출이 판단 기준보다 적어요", confidence: "낮음", basis: "relative", interval: null });
        continue;
      }
      const ratio = r.ctr / upperCtr;
      const enough = r.impressions >= 10000;
      const status: DecisionStatus = enough && ratio <= 0.6 ? "kill" : enough && ratio >= 1.4 && !fatiguedIds.has(r.id) ? "scale" : "watch";
      out.set(r.id, {
        ...base,
        status,
        reason: `CTR ${(r.ctr * 100).toFixed(2)}% — 트래픽 소재 중앙값의 ${ratio.toFixed(1)}배${fatiguedIds.has(r.id) ? " · 피로 신호" : ""}`,
        confidence: r.impressions >= 50000 ? "높음" : enough ? "보통" : "낮음",
        basis: "relative",
        interval: null,
      });
      continue;
    }

    // 전환(CV) 소재 — 전환이 거의 없는 구간
    if (r.conversions < MIN_CONV || r.roas == null) {
      if (accountCpa && r.cost >= accountCpa * 3 && age > 3) {
        out.set(r.id, {
          ...base,
          status: "kill",
          reason: `전환 ${r.conversions.toFixed(0)}건에 ${won(r.cost)} 소진 — 계정 CPA ${won(accountCpa)}의 ${(r.cost / Math.max(1, r.conversions) / accountCpa).toFixed(1)}배${r.conversions === 0 ? "(전환 0)" : ""}`,
          confidence: r.cost >= accountCpa * 5 ? "높음" : "보통",
          basis: "target",
          interval: null,
        });
      } else if (age > 7) {
        out.set(r.id, { ...base, status: "starved", reason: `집행 ${age}일째, 광고비 ${won(r.cost)} · 전환 ${r.conversions.toFixed(0)}건 — 메타가 예산을 거의 안 줘요. 정리 대상`, confidence: "보통", basis: "target", interval: null });
      } else {
        out.set(r.id, { ...base, status: "new", reason: `집행 ${age || "?"}일째 · 전환 ${r.conversions.toFixed(0)}건 — ${MIN_CONV}건 이상 쌓이면 판정해요`, confidence: "낮음", basis: "target", interval: null });
      }
      continue;
    }

    const ci = interval(r.roas, r.conversions);
    const trend = roasTrend(r);
    const falling = trend && trend.before > 0 && trend.recent / trend.before <= 0.7;
    const tired = fatiguedIds.has(r.id);
    const c = confOf(ci.rel);
    const range = `${pct(ci.low)}~${pct(ci.high)}`;
    const tgt = `목표 ${tPct.toLocaleString("ko-KR")}%${kind !== "base" && rules[kind as Exclude<CampaignKind, "base">] ? `(${KIND_LABEL[kind]})` : ""}`;
    const iv = { low: ci.low, high: ci.high };
    if (ci.low >= target) {
      if (falling || tired) {
        out.set(r.id, {
          ...base,
          status: "watch",
          reason: `ROAS ${pct(r.roas)}로 ${tgt} 이상이지만 ${falling ? `최근 3일 ${pct(trend!.recent)}로 ${Math.round((1 - trend!.recent / trend!.before) * 100)}% 꺾임` : "피로 신호(CTR 초반 대비 −30%)"} — 교체 소재 준비`,
          confidence: c,
          basis: "target",
          interval: iv,
        });
      } else {
        out.set(r.id, { ...base, status: "scale", reason: `ROAS ${pct(r.roas)}(90% 구간 ${range}) — ${tgt}을 확실히 넘어요 · 전환 ${r.conversions.toFixed(0)}건`, confidence: c, basis: "target", interval: iv });
      }
    } else if (ci.high < target) {
      out.set(r.id, { ...base, status: "kill", reason: `ROAS ${pct(r.roas)}(90% 구간 ${range}) — ${tgt}에 확실히 못 미쳐요 · 전환 ${r.conversions.toFixed(0)}건`, confidence: c, basis: "target", interval: iv });
    } else {
      out.set(r.id, { ...base, status: "watch", reason: `ROAS ${pct(r.roas)}(90% 구간 ${range}) — ${tgt}와 아직 구분 안 돼요${falling ? " · 최근 3일 꺾임" : ""}`, confidence: c, basis: "target", interval: iv });
    }
  }
  return out;
}

// ── 광고세트 행동 ─────────────────────────────
export type AdsetAction = {
  adsetId: string;
  adsetName: string;
  campaignName: string;
  budgetMode: "ABO" | "CBO" | "Advantage+";
  dailyBudget: number | null;
  cost: number;
  roas: number | null;
  conversions: number;
  target: number;
  counts: Record<DecisionStatus, number>;
  killIds: string[];
  scaleIds: string[];
  verdict: "scale" | "cut" | "prune" | "hold";
  action: string;
};

export function adsetActions(rows: Enriched[], decisions: Map<string, Decision>, adsets: AdsetSetting[], campaigns: CampaignSetting[]): AdsetAction[] {
  const adsetById = new Map(adsets.map((a) => [a.id, a]));
  const campById = new Map(campaigns.map((c) => [c.id, c]));
  const by = new Map<string, Enriched[]>();
  for (const r of rows) if (r.group === "sales") by.set(r.adsetId, [...(by.get(r.adsetId) ?? []), r]);
  const out: AdsetAction[] = [];
  for (const [id, list] of by) {
    const set = adsetById.get(id);
    const camp = campById.get(list[0].campaignId) ?? null;
    const cost = list.reduce((a, r) => a + r.cost, 0);
    const rev = list.reduce((a, r) => a + r.revenue, 0);
    const conv = list.reduce((a, r) => a + r.conversions, 0);
    const roas = cost > 0 ? rev / cost : null;
    // 세트 목표 = 소재 목표의 광고비 가중 평균(보통 한 세트 = 한 유형)
    const target = cost > 0 ? list.reduce((a, r) => a + (decisions.get(r.id)?.target ?? 500) * r.cost, 0) / cost : 500;
    const counts: Record<DecisionStatus, number> = { scale: 0, watch: 0, kill: 0, new: 0, starved: 0 };
    for (const r of list) counts[decisions.get(r.id)?.status ?? "new"]++;
    const killIds = list.filter((r) => decisions.get(r.id)?.status === "kill").map((r) => r.id);
    const scaleIds = list.filter((r) => decisions.get(r.id)?.status === "scale").map((r) => r.id);
    const budgetMode: AdsetAction["budgetMode"] = camp?.advantagePlus ? "Advantage+" : camp && (camp.dailyBudget || camp.lifetimeBudget) ? "CBO" : "ABO";
    const daily = set?.dailyBudget ?? null;
    let verdict: AdsetAction["verdict"] = "hold";
    let action = "유지 — 다음 주에 다시 보세요";
    if (roas != null && conv >= MIN_CONV) {
      const ci = interval(roas, conv);
      if (ci.low >= target / 100) {
        verdict = "scale";
        action =
          budgetMode === "ABO"
            ? daily
              ? `세트 일 예산 +20% (${won(daily)} → ${won(Math.round((daily * 1.2) / 100) * 100)})`
              : "세트 예산 +20%(총 예산형 — 관리자에서 조정)"
            : `${budgetMode === "CBO" ? "캠페인 예산(CBO)" : "Advantage+ 캠페인 예산"} +20% — 세트 단위 예산 없음${scaleIds.length ? ` · 키우기 소재 ${scaleIds.length}개로 변형 추가` : ""}`;
      } else if (ci.high < target / 100) {
        verdict = "cut";
        action = budgetMode === "ABO" ? (daily ? `세트 일 예산 −30% (${won(daily)} → ${won(Math.round((daily * 0.7) / 100) * 100)}) 또는 중단` : "세트 예산 축소 또는 중단") : `이 세트 끄기 검토(${budgetMode} — 예산은 캠페인에서 조정)`;
      }
    }
    if (verdict !== "cut" && killIds.length) {
      verdict = verdict === "scale" ? "scale" : "prune";
      action = `${verdict === "scale" ? `${action} · ` : ""}끄기 소재 ${killIds.length}개 정리${verdict === "prune" ? "(세트는 유지)" : ""}`;
    }
    out.push({ adsetId: id, adsetName: set?.name ?? list[0].adsetName, campaignName: camp?.name ?? list[0].campaignName, budgetMode, dailyBudget: daily, cost, roas, conversions: conv, target, counts, killIds, scaleIds, verdict, action });
  }
  const rank = { cut: 0, scale: 1, prune: 2, hold: 3 } as const;
  return out.sort((a, b) => rank[a.verdict] - rank[b.verdict] || b.cost - a.cost);
}
