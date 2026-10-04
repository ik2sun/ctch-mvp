// 캠페인 오토파일럿 · GFA 세팅안 생성(서버 전용) — Claude Sonnet 5.5 + json_schema
import Anthropic from "@anthropic-ai/sdk";
import {
  AGE_KEYS,
  CTA_OPTIONS,
  OBJECTIVE_LABEL,
  MIN_ADSET_BUDGET,
  clampCopy,
  roundBudget,
  type AgeKey,
  type GfaContext,
  type PlanAdSet,
  type SetupBrief,
  type SetupPlan,
} from "./types";

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    adSets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          rationale: { type: "string" },
          genders: { type: "array", items: { type: "string", enum: ["M", "F"] } },
          ages: { type: "array", items: { type: "string", enum: AGE_KEYS } },
          device: { type: "string", enum: ["ALL", "MOBILE"] },
          budgetShare: { type: "number" },
        },
        required: ["label", "rationale", "genders", "ages", "device", "budgetShare"],
        additionalProperties: false,
      },
    },
    copies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          message: { type: "string" },
          linkTitle: { type: "string" },
          linkDescription: { type: "string" },
          cta: { type: "string", enum: CTA_OPTIONS.map((c) => c.value) },
        },
        required: ["message", "linkTitle", "linkDescription", "cta"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "adSets", "copies"],
  additionalProperties: false,
};

const SYSTEM = `당신은 네이버 성과형 디스플레이 광고(GFA)를 10년 운영한 퍼포먼스 마케터입니다.
담당자가 GFA에 캠페인만 만들어 두었습니다. 브리프를 보고 그 캠페인 아래 광고그룹(타겟·예산)과 단일 이미지 소재 카피를 설계합니다.

광고그룹(adSets)
- 개수: 브리프에 지정이 있으면 그대로, 0이면 2~4개. 예산이 적으면(광고그룹당 3만 원 미만이 되면) 개수를 줄인다
- 서로 겹치지 않는 가설로 나눈다(예: 핵심 타겟 / 확장 연령 / 성별 분리). 같은 타겟을 둘로 쪼개 경쟁시키지 않는다
- label: 네이밍에 들어갈 짧은 타겟 이름(한글 또는 영문 2~12자, 공백 없이, 예 "핵심3040", "선물수요", "재방문")
- rationale: 이 타겟을 고른 이유 1문장(브리프 근거)
- genders: 빈 배열 = 전체. ages: 빈 배열 = 전체, 아니면 연속된 구간
- device: 기본 ALL. 모바일 전용 랜딩이거나 브리프가 요구하면 MOBILE
- budgetShare: 일 예산 비중(합계 100). 핵심 가설에 더 준다
- 관심사·고객파일 타겟은 API로 코드를 고를 수 없어 쓰지 않는다

카피(copies) — 브리프의 개수만큼, 서로 다른 소구점(혜택·문제 해결·사회적 증거 등)
- message(광고 문구): 20~45자, 최대 65자
- linkTitle(제목): 8~20자, 최대 25자
- linkDescription(설명): 12~35자, 최대 45자
- cta: 목적에 맞는 버튼(전환·구매 = BUY 또는 N_LOOK, 트래픽 = MORE, 쿠폰 혜택 = N_COUPON)
규칙: 가격·할인율·수치·수상·1위 표현은 브리프에 있는 것만 쓴다. 없으면 쓰지 않는다. 과장·최상급·의학적 효능 표현 금지. 한국어.

summary: 세팅안 전체 설명 2~3문장(구조와 이유).
출력은 JSON 스키마 객체 하나뿐.`;

type RawPlan = {
  summary: string;
  adSets: (Omit<PlanAdSet, "budget"> & { budgetShare: number })[];
  copies: SetupPlan["copies"];
};

export async function buildPlan(ctx: GfaContext, brief: SetupBrief, imageCount: number): Promise<SetupPlan> {
  const payload = {
    캠페인: { 이름: ctx.campaign.name, 목적: OBJECTIVE_LABEL[ctx.campaign.objective] ?? ctx.campaign.objective, 예산최적화CBO: ctx.campaign.cbo },
    이미_있는_광고그룹: ctx.existingAdSets.map((s) => s.name).slice(0, 20),
    브리프: {
      상품: brief.product,
      프로모션_혜택: brief.offer || "(없음)",
      타겟_메모: brief.audience || "(없음 — 상품으로 판단)",
      랜딩URL: brief.landingUrl,
      일예산_합계_원: brief.dailyBudget,
      광고그룹_개수: brief.adSetCount || "AI가 판단(2~4)",
      카피_개수: brief.copyCount,
      참고_메모: brief.notes || "(없음)",
    },
    이미지_수: imageCount,
  };
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, timeout: 120_000 });
  const msg = (await anthropic.beta.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 10000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as never,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(payload, null, 2) }],
  } as never)) as Anthropic.Beta.BetaMessage;
  if (msg.stop_reason === "refusal") throw new Error("AI가 요청을 거절했어요.");
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let raw: RawPlan;
  try {
    raw = JSON.parse(text) as RawPlan;
  } catch {
    throw new Error("세팅안 응답을 해석하지 못했어요. 다시 시도해 주세요.");
  }
  return normalizePlan(raw, brief);
}

// 모델 출력 정리 — 개수·예산 합계·글자 수·연령 구간 순서를 코드에서 맞춘다
function normalizePlan(raw: RawPlan, brief: SetupBrief): SetupPlan {
  let sets = (raw.adSets ?? []).filter((a) => a?.label);
  if (brief.adSetCount > 0) sets = sets.slice(0, brief.adSetCount);
  if (!sets.length) throw new Error("AI가 광고그룹을 만들지 못했어요. 브리프를 조금 더 채워 주세요.");
  const shareSum = sets.reduce((s, a) => s + Math.max(0, a.budgetShare || 0), 0) || sets.length;
  const adSets: PlanAdSet[] = sets.map((a) => ({
    label: a.label.replace(/\s+/g, "").slice(0, 16),
    rationale: a.rationale,
    genders: a.genders.length >= 2 ? [] : a.genders,
    ages: a.ages.length >= AGE_KEYS.length ? [] : AGE_KEYS.filter((k) => a.ages.includes(k as AgeKey)),
    device: a.device === "MOBILE" ? "MOBILE" : "ALL",
    budget: roundBudget((brief.dailyBudget * (Math.max(0, a.budgetShare || 0) || 1)) / shareSum),
  }));
  // 반올림 차이는 예산이 가장 큰 광고그룹에서 맞춘다(합계 = 브리프 일 예산)
  const diff = roundBudget(brief.dailyBudget) - adSets.reduce((t, a) => t + a.budget, 0);
  const top = adSets.reduce((m, a) => (a.budget > m.budget ? a : m), adSets[0]);
  if (top.budget + diff >= MIN_ADSET_BUDGET) top.budget += diff;
  const copies = (raw.copies ?? []).slice(0, Math.max(1, brief.copyCount)).map(clampCopy);
  if (!copies.length) throw new Error("AI가 카피를 만들지 못했어요. 다시 시도해 주세요.");
  return { summary: raw.summary, adSets, copies };
}
