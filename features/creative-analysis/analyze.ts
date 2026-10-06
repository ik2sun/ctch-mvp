// 소재 분석 계산 — 순수 함수. 수치는 API 값만 쓰고, 비교는 같은 캠페인 목표 그룹 안에서만 한다.
import type { AdsetSetting, CampaignSetting, CreativeRow, ObjectiveGroup } from "./types";
import { parseAdsetName, type NamingDict, type ParsedAdName } from "./naming";
import { fieldDims, parseName } from "./nameSchema";
import type { UtmLabel } from "./namingRules";

export type Grade = "top" | "good" | "mid" | "low" | "hold"; // 상위10% · 상위25% · 보통 · 하위25% · 판단 보류

export type AudienceType = "리타겟(맞춤)" | "유사 타겟" | "관심사" | "Advantage+ 타겟" | "광범위";

export type TargetSummary = {
  gender: "남" | "여" | "전체";
  age: string; // 25~65+
  ageBand: string; // 비교용 구간
  audienceType: AudienceType;
  excludesBuyers: boolean;
  label: string; // 한 줄 요약
};

export type Enriched = CreativeRow & {
  parsed: ParsedAdName;
  group: ObjectiveGroup;
  campaign: CampaignSetting | null;
  adset: AdsetSetting | null;
  target: TargetSummary | null;
  roas: number | null;
  cpa: number | null;
  ctr: number | null; // 링크 클릭 / 노출
  cvr: number | null; // 구매 / 링크 클릭
  cpm: number | null;
  hookRate: number | null; // 3초 재생 / 노출 (영상)
  holdRate: number | null; // 완전 재생(ThruPlay) / 3초 재생
  ageDays: number | null; // 기간 종료일 기준 집행 일수(소재명 날짜)
  judged: boolean;
  grade: Grade;
  score: number | null; // 그룹 내 순위 지표(전환=ROAS, 상위퍼널=CTR)
  utmLabel?: UtmLabel | null; // 광고주 UTM 규칙으로 읽은 값(화면에서 붙임 — namingRules.labelUtm)
  demo?: { age: string; gender: string }; // 실제 성별·연령 구간으로 쪼갠 행이면 그 구간(combos.expandDemo) — 지표도 그 구간 값
};

const div = (a: number, b: number) => (b > 0 ? a / b : null);

export function summarizeTarget(s: AdsetSetting): TargetSummary {
  const gender = s.genders.length === 1 ? (s.genders[0] === 1 ? "남" : "여") : "전체";
  const max = s.ageMax == null ? null : s.ageMax >= 65 ? "65+" : String(s.ageMax);
  const age = `${s.ageMin ?? 18}~${max ?? "65+"}`;
  const span = (s.ageMax ?? 65) - (s.ageMin ?? 18);
  const ageBand = span >= 35 ? "넓게(35세 폭 이상)" : span >= 20 ? "중간(20~34세 폭)" : "좁게(20세 폭 미만)";
  const lookalike = s.customIncluded.some((n) => /유사|lookalike/i.test(n));
  const audienceType: AudienceType = lookalike
    ? "유사 타겟"
    : s.customIncluded.length
      ? "리타겟(맞춤)"
      : s.interests.length
        ? "관심사"
        : s.advantageAudience
          ? "Advantage+ 타겟"
          : "광범위";
  const excludesBuyers = s.customExcluded.some((n) => /구매|purchase/i.test(n));
  const parts = [gender === "전체" ? "남녀" : gender, age, audienceType];
  if (s.customIncluded.length) parts.push(s.customIncluded.slice(0, 2).join("·"));
  if (s.interests.length) parts.push(`관심사 ${s.interests.slice(0, 2).join("·")}`);
  if (s.customExcluded.length) parts.push(`제외 ${s.customExcluded.slice(0, 2).join("·")}`);
  return { gender, age, ageBand, audienceType, excludesBuyers, label: parts.join(" · ") };
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

export function enrich(
  creatives: CreativeRow[],
  adsets: AdsetSetting[],
  campaigns: CampaignSetting[],
  dict: NamingDict,
  periodUntil: string,
  minImpressions: number,
): Enriched[] {
  const adsetById = new Map(adsets.map((a) => [a.id, a]));
  const campById = new Map(campaigns.map((c) => [c.id, c]));
  const until = Date.parse(`${periodUntil}T00:00:00`);
  const rows: Enriched[] = creatives.map((c) => {
    const parsed = parseName(c.name, c.campaignName, dict); // 규칙 파일이 있으면 그 규칙(캠페인으로 세트 선택), 없으면 내장 해석
    const campaign = campById.get(c.campaignId) ?? null;
    const adset = adsetById.get(c.adsetId) ?? null;
    const group: ObjectiveGroup = campaign?.group ?? (parsed.objective === "전환" ? "sales" : "upper");
    const launch = parsed.launchDate ? Date.parse(`${parsed.launchDate}T00:00:00`) : c.createdTime ? Date.parse(c.createdTime) : NaN;
    const judged = c.impressions >= minImpressions && (group === "upper" || c.cost > 0);
    const roas = div(c.revenue, c.cost);
    const ctr = div(c.linkClicks, c.impressions);
    return {
      ...c,
      parsed,
      group,
      campaign,
      adset,
      target: adset ? summarizeTarget(adset) : null,
      roas,
      cpa: div(c.cost, c.conversions),
      ctr,
      cvr: div(c.conversions, c.linkClicks),
      cpm: c.impressions > 0 ? (c.cost / c.impressions) * 1000 : null,
      hookRate: c.format === "video" ? div(c.videoViews3s, c.impressions) : null,
      holdRate: c.format === "video" ? div(c.thruplays, c.videoViews3s) : null,
      ageDays: isNaN(launch) ? null : Math.max(0, Math.round((until - launch) / 86400000) + 1),
      judged,
      grade: "hold",
      score: group === "sales" ? roas : ctr,
    };
  });
  // 그룹 안에서 등급 — 판단 가능한 소재만, 상위 10%·25%·하위 25%
  for (const g of ["sales", "upper"] as ObjectiveGroup[]) {
    const pool = rows.filter((r) => r.group === g && r.judged && r.score != null);
    const sorted = pool.map((r) => r.score!).sort((a, b) => a - b);
    const p90 = percentile(sorted, 0.9);
    const p75 = percentile(sorted, 0.75);
    const p25 = percentile(sorted, 0.25);
    for (const r of pool) {
      const s = r.score!;
      r.grade = pool.length < 4 ? "mid" : s >= p90 ? "top" : s >= p75 ? "good" : s <= p25 ? "low" : "mid";
    }
  }
  return rows;
}

export const GRADE_META: Record<Grade, { label: string; cls: string; icon: string }> = {
  top: { label: "상위 10%", cls: "bg-good/10 text-good", icon: "ti-trophy" },
  good: { label: "상위 25%", cls: "bg-good/5 text-good", icon: "ti-arrow-up" },
  mid: { label: "보통", cls: "bg-canvas text-ink-muted", icon: "ti-minus" },
  low: { label: "하위 25%", cls: "bg-bad/5 text-bad", icon: "ti-arrow-down" },
  hold: { label: "판단 보류", cls: "bg-canvas text-ink-faint", icon: "ti-hourglass" },
};

// ── 요소별 성과 ───────────────────────────────────────────
export type Dimension = { key: string; label: string; get: (r: Enriched) => string | string[] | null };

const ageBucket = (d: number | null) => (d == null ? null : d <= 7 ? "1주 이내" : d <= 30 ? "8~30일" : d <= 90 ? "31~90일" : "90일 초과");
const FORMAT_LABEL: Record<string, string> = { video: "영상", image: "이미지", dynamic: "다이내믹(여러 에셋)", carousel: "캐러셀", other: "기타" };

// 소재명 요소 — 광고주 규칙의 텍스트 항목(이름 그대로) + 포맷 + 집행 기간. 내장 해석이면 목표·콘텐츠·상품·모델·TVC·인플루언서·영상 길이
export function creativeDims(rows: Enriched[]): Dimension[] {
  return [
    ...fieldDims(rows),
    { key: "format", label: "포맷", get: (r) => FORMAT_LABEL[r.format] ?? r.format },
    { key: "age", label: "집행 기간", get: (r) => ageBucket(r.ageDays) },
  ];
}

export const TARGET_DIMENSIONS: Dimension[] = [
  { key: "audience", label: "타겟 유형", get: (r) => r.target?.audienceType ?? null },
  { key: "gender", label: "성별", get: (r) => r.target?.gender ?? null },
  { key: "age", label: "연령", get: (r) => r.target?.age ?? null },
  { key: "ageBand", label: "연령 폭", get: (r) => r.target?.ageBand ?? null },
  { key: "exclude", label: "구매자 제외", get: (r) => (r.target ? (r.target.excludesBuyers ? "구매자 제외함" : "제외 안 함") : null) },
  { key: "opt", label: "최적화 목표", get: (r) => (r.adset?.optimizationGoal ? OPT_LABEL[r.adset.optimizationGoal] ?? r.adset.optimizationGoal : null) },
  { key: "placement", label: "지면", get: (r) => (r.adset ? (r.adset.placements === "auto" ? "자동(Advantage+ 지면)" : "수동 지면") : null) },
  { key: "campaign", label: "캠페인", get: (r) => r.campaignName },
];

export const OPT_LABEL: Record<string, string> = {
  OFFSITE_CONVERSIONS: "전환",
  LANDING_PAGE_VIEWS: "랜딩 페이지 조회",
  LINK_CLICKS: "링크 클릭",
  REACH: "도달",
  IMPRESSIONS: "노출",
  THRUPLAY: "ThruPlay",
  VALUE: "전환 가치",
  POST_ENGAGEMENT: "게시물 참여",
  VIDEO_VIEWS: "동영상 조회",
  LEAD_GENERATION: "잠재고객",
};

export type Bucket = {
  key: string;
  count: number;
  judged: number;
  cost: number;
  revenue: number;
  conversions: number;
  impressions: number;
  linkClicks: number;
  videoViews3s: number;
  roas: number | null;
  cpa: number | null;
  ctr: number | null;
  cvr: number | null;
  cpm: number | null;
  costShare: number;
  top: number; // 상위 25% 이상 소재 수
};

export function breakdown(rows: Enriched[], dim: Dimension): Bucket[] {
  const map = new Map<string, Enriched[]>();
  for (const r of rows) {
    const v = dim.get(r);
    for (const k of Array.isArray(v) ? v : v ? [v] : []) {
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
  }
  const total = rows.reduce((a, r) => a + r.cost, 0);
  return [...map.entries()]
    .map(([key, rs]) => {
      const s = rs.reduce(
        (a, r) => ({
          cost: a.cost + r.cost,
          revenue: a.revenue + r.revenue,
          conversions: a.conversions + r.conversions,
          impressions: a.impressions + r.impressions,
          linkClicks: a.linkClicks + r.linkClicks,
          videoViews3s: a.videoViews3s + r.videoViews3s,
        }),
        { cost: 0, revenue: 0, conversions: 0, impressions: 0, linkClicks: 0, videoViews3s: 0 },
      );
      return {
        key,
        count: rs.length,
        judged: rs.filter((r) => r.judged).length,
        ...s,
        roas: div(s.revenue, s.cost),
        cpa: div(s.cost, s.conversions),
        ctr: div(s.linkClicks, s.impressions),
        cvr: div(s.conversions, s.linkClicks),
        cpm: s.impressions > 0 ? (s.cost / s.impressions) * 1000 : null,
        costShare: total > 0 ? s.cost / total : 0,
        top: rs.filter((r) => r.grade === "top" || r.grade === "good").length,
      };
    })
    .sort((a, b) => b.cost - a.cost);
}

// ── 피로도 — 일별이 있는 소재(광고비 상위)만 ─────────────────
export type Fatigue = { row: Enriched; ctrFirst: number; ctrLast: number; drop: number; days: number };

// 피로도 기준 — 화면에서 바꿀 수 있음(기본: 7일 이상 집행 · 빈도 2회 이상 · 처음 3일 대비 마지막 3일 CTR −30% 이상)
export type FatigueRule = { minDays: number; minFreq: number; drop: number; window: number };
export const DEFAULT_FATIGUE: FatigueRule = { minDays: 7, minFreq: 2, drop: 0.3, window: 3 };

export function fatigue(rows: Enriched[], rule: FatigueRule = DEFAULT_FATIGUE): Fatigue[] {
  const out: Fatigue[] = [];
  const w = Math.max(1, Math.round(rule.window));
  for (const r of rows) {
    const d = (r.daily ?? []).filter((p) => p.impressions > 0);
    if (d.length < Math.max(rule.minDays, w * 2)) continue;
    const head = d.slice(0, w);
    const tail = d.slice(-w);
    const ctr = (ps: typeof d) => {
      const im = ps.reduce((a, p) => a + p.impressions, 0);
      return im > 0 ? ps.reduce((a, p) => a + p.clicks, 0) / im : 0;
    };
    const a = ctr(head);
    const b = ctr(tail);
    if (a <= 0) continue;
    const drop = (b - a) / a;
    if (drop <= -rule.drop && r.frequency >= rule.minFreq) out.push({ row: r, ctrFirst: a, ctrLast: b, drop, days: d.length });
  }
  return out.sort((x, y) => y.row.cost - x.row.cost);
}

// ── 세팅 점검 ───────────────────────────────────────────
export type SettingCheck = { id: string; tone: "bad" | "warn" | "info"; title: string; detail: string; adsetIds: string[] };

export function settingChecks(rows: Enriched[], adsets: AdsetSetting[], campaigns: CampaignSetting[], dict: NamingDict): SettingCheck[] {
  const out: SettingCheck[] = [];
  const delivering = new Map<string, Enriched[]>();
  for (const r of rows) {
    if (!delivering.has(r.adsetId)) delivering.set(r.adsetId, []);
    delivering.get(r.adsetId)!.push(r);
  }
  const used = adsets.filter((a) => delivering.has(a.id));
  const campById = new Map(campaigns.map((c) => [c.id, c]));

  // 1) 광고세트 이름과 실제 타겟 불일치
  for (const a of used) {
    const n = parseAdsetName(a.name, dict);
    const t = summarizeTarget(a);
    const issues: string[] = [];
    if (n.gender && n.gender !== t.gender) issues.push(`이름은 ${n.gender}, 실제 ${t.gender}`);
    if (n.ageMin != null && n.ageMin !== (a.ageMin ?? 18)) issues.push(`이름 연령 ${n.ageMin}~${n.ageMax ?? ""}, 실제 ${t.age}`);
    else if (n.ageMax != null && a.ageMax != null && n.ageMax !== a.ageMax && !(n.ageMax >= 65 && a.ageMax >= 65)) issues.push(`이름 연령 ${n.ageMin}~${n.ageMax}, 실제 ${t.age}`);
    if (n.audience.includes("유사 타겟") && t.audienceType !== "유사 타겟") issues.push("이름은 유사 타겟, 실제 맞춤 타겟에 유사 타겟 없음");
    if (issues.length) {
      out.push({ id: `name-${a.id}`, tone: "bad", title: `이름과 실제 타겟이 달라요: ${a.name}`, detail: `${issues.join(" · ")}. 의도한 세팅인지 확인하세요 — 이름 기준으로 보고하면 결과를 잘못 해석하게 돼요.`, adsetIds: [a.id] });
    }
  }

  // 2) 같은 캠페인 안에 타겟이 똑같은 광고세트가 여럿 — 서로 경쟁
  const sig = (a: AdsetSetting) =>
    [a.campaignId, a.genders.join(","), a.ageMin, a.ageMax, [...a.customIncluded].sort().join("|"), [...a.customExcluded].sort().join("|"), [...a.interests].sort().join("|"), a.advantageAudience, a.optimizationGoal].join("#");
  const bySig = new Map<string, AdsetSetting[]>();
  for (const a of used) {
    const k = sig(a);
    if (!bySig.has(k)) bySig.set(k, []);
    bySig.get(k)!.push(a);
  }
  for (const [, group] of bySig) {
    if (group.length < 3) continue;
    const camp = campById.get(group[0].campaignId);
    out.push({
      id: `dup-${group[0].id}`,
      tone: "warn",
      title: `같은 타겟 광고세트 ${group.length}개가 한 캠페인에서 경쟁해요`,
      detail: `${camp?.name ?? "캠페인"} · ${summarizeTarget(group[0]).label}. 같은 사람을 두고 경매에서 서로 겨뤄 CPM이 오를 수 있어요 — 소재 테스트 목적이 아니면 세트를 합치는 걸 검토하세요.`,
      adsetIds: group.map((g) => g.id),
    });
  }

  // 3) 전환 목표 신규 유입 세트인데 구매자 제외 없음(일부 세트만 제외 중일 때)
  const salesProspect = used.filter((a) => campById.get(a.campaignId)?.group === "sales" && summarizeTarget(a).audienceType !== "리타겟(맞춤)");
  const withEx = salesProspect.filter((a) => summarizeTarget(a).excludesBuyers);
  const withoutEx = salesProspect.filter((a) => !summarizeTarget(a).excludesBuyers);
  if (withEx.length && withoutEx.length) {
    const cost = withoutEx.reduce((s, a) => s + (delivering.get(a.id) ?? []).reduce((x, r) => x + r.cost, 0), 0);
    out.push({
      id: "buyers-exclude",
      tone: "warn",
      title: `구매자 제외가 ${withEx.length}개 세트에만 적용돼 있어요`,
      detail: `신규 유입용 전환 세트 ${withoutEx.length}개(광고비 ₩${Math.round(cost).toLocaleString("ko-KR")})는 최근 구매자를 제외하지 않아요. 재구매 유도가 목적이 아니라면 같은 제외 타겟을 맞추세요.`,
      adsetIds: withoutEx.map((a) => a.id),
    });
  }

  // 4) 학습 제한
  const limited = used.filter((a) => a.learning === "FAIL");
  if (limited.length) {
    out.push({
      id: "learning-limited",
      tone: "warn",
      title: `학습 제한 상태 광고세트 ${limited.length}개`,
      detail: `${limited.slice(0, 3).map((a) => a.name).join(", ")}${limited.length > 3 ? " 외" : ""}. 주 50회 전환에 못 미쳐 최적화가 불안정해요 — 세트 통합이나 예산·전환 이벤트 조정을 검토하세요.`,
      adsetIds: limited.map((a) => a.id),
    });
  }

  // 5) 소재가 많은데 한두 개에 광고비가 몰린 세트
  for (const a of used) {
    const rs = (delivering.get(a.id) ?? []).sort((x, y) => y.cost - x.cost);
    const total = rs.reduce((s, r) => s + r.cost, 0);
    if (rs.length >= 8 && total > 0 && rs[0].cost / total >= 0.7) {
      const idle = rs.filter((r) => r.cost / total < 0.02).length;
      out.push({
        id: `concentrated-${a.id}`,
        tone: "info",
        title: `소재 ${rs.length}개 중 1개가 광고비 ${Math.round((rs[0].cost / total) * 100)}%를 써요`,
        detail: `${a.name} — 나머지 중 ${idle}개는 광고비 2% 미만이라 사실상 테스트되지 않아요. 소재를 줄이거나 따로 테스트 세트로 빼는 걸 검토하세요.`,
        adsetIds: [a.id],
      });
    }
  }
  const order = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

// ── 소재 인사이트 ─────────────────────────────────────────
export type CreativeInsight = { id: string; tone: "good" | "warn" | "bad" | "info"; title: string; detail: string; weight: number };

const pct = (v: number) => `${Math.round(v * 100)}%`;
const won = (v: number) => `₩${Math.round(v).toLocaleString("ko-KR")}`;

export function creativeInsights(rows: Enriched[], fat: Fatigue[]): CreativeInsight[] {
  const out: CreativeInsight[] = [];
  const sales = rows.filter((r) => r.group === "sales");
  const judged = sales.filter((r) => r.judged && r.cost > 0);
  const totalRev = sales.reduce((a, r) => a + r.revenue, 0);
  const totalCost = sales.reduce((a, r) => a + r.cost, 0);
  const avgRoas = totalCost > 0 ? totalRev / totalCost : null;

  // 매출 집중도
  if (judged.length >= 10 && totalRev > 0) {
    const byRev = [...sales].sort((a, b) => b.revenue - a.revenue);
    const n = Math.max(1, Math.round(sales.length * 0.2));
    const share = byRev.slice(0, n).reduce((a, r) => a + r.revenue, 0) / totalRev;
    out.push({ id: "concentration", tone: "info", title: `상위 20% 소재(${n}개)가 매출의 ${pct(share)}를 만들어요`, detail: `전환 캠페인 소재 ${sales.length}개 기준. 상위 소재의 공통 요소가 아래 '요소별 성과'에 드러나요.`, weight: 60 });
  }

  // 요소별 — 소재 3개 이상·광고비 5% 이상 그룹 중 평균 대비 1.3배 이상/0.7배 이하
  if (avgRoas) {
    for (const dim of creativeDims(rows).filter((d) => d.key !== "age")) {
      const bs = breakdown(sales, dim).filter((b) => b.count >= 3 && b.costShare >= 0.05 && b.roas != null);
      if (bs.length < 2) continue;
      const best = [...bs].sort((a, b) => b.roas! - a.roas!)[0];
      const worst = [...bs].sort((a, b) => a.roas! - b.roas!)[0];
      if (best.roas! >= avgRoas * 1.3)
        out.push({
          id: `dim-best-${dim.key}`,
          tone: "good",
          title: `${dim.label}: '${best.key}' ROAS ${pct(best.roas!)} — 평균의 ${(best.roas! / avgRoas).toFixed(1)}배`,
          detail: `소재 ${best.count}개 · 광고비 비중 ${pct(best.costShare)}. 다음 제작 때 이 요소를 우선 검토하세요.`,
          weight: 50 + best.costShare * 30,
        });
      if (worst !== best && worst.roas! <= avgRoas * 0.7)
        out.push({
          id: `dim-worst-${dim.key}`,
          tone: "warn",
          title: `${dim.label}: '${worst.key}' ROAS ${pct(worst.roas!)} — 평균의 ${(worst.roas! / avgRoas).toFixed(1)}배`,
          detail: `소재 ${worst.count}개가 광고비 ${pct(worst.costShare)}(${won(worst.cost)})를 썼어요. 예산 축소나 소재 교체 후보예요.`,
          weight: 55 + worst.costShare * 40,
        });
    }
  }

  // 후킹은 좋은데 전환이 약한 소재
  const ctrs = judged.map((r) => r.ctr ?? 0).sort((a, b) => a - b);
  const cvrs = judged.filter((r) => r.cvr != null).map((r) => r.cvr!).sort((a, b) => a - b);
  if (judged.length >= 8) {
    const ctrMed = percentile(ctrs, 0.5);
    const cvrMed = percentile(cvrs, 0.5);
    const leaky = judged.filter((r) => (r.ctr ?? 0) >= ctrMed * 1.3 && r.cvr != null && r.cvr <= cvrMed * 0.6);
    if (leaky.length)
      out.push({
        id: "leaky",
        tone: "warn",
        title: `클릭은 잘 받는데 구매로 안 이어지는 소재 ${leaky.length}개`,
        detail: `CTR은 중앙값의 1.3배 이상, CVR은 0.6배 이하예요. 소재 약속(가격·혜택)과 랜딩 페이지가 맞는지 점검하세요 — 예: ${leaky.slice(0, 2).map((r) => r.name).join(", ")}`,
        weight: 58,
      });
  }

  // 신규 소재
  const fresh = judged.filter((r) => r.ageDays != null && r.ageDays <= 7);
  const old = judged.filter((r) => r.ageDays != null && r.ageDays > 30);
  const roasOf = (rs: Enriched[]) => {
    const c = rs.reduce((a, r) => a + r.cost, 0);
    return c > 0 ? rs.reduce((a, r) => a + r.revenue, 0) / c : null;
  };
  const fr = roasOf(fresh);
  const or = roasOf(old);
  if (fresh.length >= 3 && old.length >= 3 && fr && or) {
    const better = fr >= or;
    out.push({
      id: "fresh-vs-old",
      tone: better ? "info" : "warn",
      title: `1주 이내 신규 소재 ROAS ${pct(fr)} vs 30일 넘은 소재 ${pct(or)}`,
      detail: better ? `신규 소재 ${fresh.length}개가 기존보다 효율이 좋아요. 교체 주기를 유지하세요.` : `신규 소재 ${fresh.length}개가 아직 기존 소재를 못 따라가요. 기존 승리 소재의 요소를 이어받는 변형을 검토하세요.`,
      weight: 45,
    });
  }

  if (fat.length)
    out.push({
      id: "fatigue",
      tone: "bad",
      title: `피로 의심 소재 ${fat.length}개 — CTR이 집행 초반보다 30% 이상 떨어졌어요`,
      detail: `빈도 2회 이상 · 예: ${fat.slice(0, 2).map((f) => `${f.row.name}(CTR ${(f.ctrFirst * 100).toFixed(2)}%→${(f.ctrLast * 100).toFixed(2)}%)`).join(", ")}. 교체 소재를 준비하세요.`,
      weight: 75,
    });

  const holdCost = sales.filter((r) => !r.judged).reduce((a, r) => a + r.cost, 0);
  if (totalCost > 0 && holdCost / totalCost >= 0.15)
    out.push({ id: "hold", tone: "info", title: `노출 부족으로 판단 보류인 소재가 광고비 ${pct(holdCost / totalCost)}를 썼어요`, detail: `소재를 너무 많이 나눠 집행하면 어느 것도 판단할 만큼 노출되지 않아요.`, weight: 35 });

  return out.sort((a, b) => b.weight - a.weight).slice(0, 8);
}
