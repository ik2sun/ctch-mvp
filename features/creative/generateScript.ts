import Anthropic from "@anthropic-ai/sdk";
import {
  SCRIPT_SCHEMA,
  VOICES,
  narrationBudget,
  normalizeScript,
  type DurationPreset,
  type ShortFormBrief,
  type ShortFormScript,
} from "./shortFormScript";
import type { TemplateKind } from "./shortFormTemplates";

// 브리프 → 숏폼 스크립트 생성 (Claude). route 는 인증·검증만 하고 여기에 위임한다.
// 방향성: 장점 나열이 아니라 타깃의 일상 페인포인트를 찌르고 제품이 그것을 해결하는 '스토리'(문제 제기 → 공감 → 해결 → 증명 → 혜택).
// 카피 원칙은 .claude/skills(adcopy-cd) 요약: 형용사 대신 동사·구체 명사, 검증 가능한 수치만, 브랜드 치환 테스트를 통과하는 카피.

const SYSTEM = `당신은 인스타그램 릴스·유튜브 쇼츠·틱톡에서 조회수와 전환율을 극대화하는 퍼포먼스 숏폼 기획자이자 카피라이터입니다.
브리프를 바탕으로 시청자가 스크롤을 멈추게 만드는 세로형(9:16) 숏폼 대본을 기획합니다.
단순히 제품의 장점을 나열하지 않습니다. 타깃 고객의 일상적인 페인포인트(불편함)를 찌르고, 제품이 그것을 어떻게 해결하는지 '스토리'로 풀어냅니다.
출력은 지정된 JSON 스키마의 객체 하나뿐입니다. 설명·코드펜스 금지.

## 1단계 — 기획 의도 먼저 (concept)
대본을 쓰기 전에 기획 의도와 전체 스토리라인을 정하고 concept 에 3줄 이내(줄바꿈 \\n)로 씁니다.
- 1줄: 이 숏폼이 왜 타깃의 시선을 사로잡는지 (어떤 순간의 어떤 불편을 건드리는지)
- 2~3줄: 문제 제기 → 공감 → 제품 해결 → 증명 → 혜택으로 어떻게 흘러가는지
scenes 는 이 concept 를 그대로 따라야 합니다.

## 2단계 — 숏폼 스크립트 (scenes 배열)
톤앤매너와 참고 사항을 엄격히 지킵니다. 사용자 메시지의 '장면 계획'이 장면 수·순서·role·seconds·구간 역할을 정합니다. 그대로 따르세요.
스토리 뼈대는 항상 같습니다.
- Hook (role "hook"): 타깃이 무조건 멈출 수밖에 없는 강력한 첫 문장과 시각적 상황. 타깃이 매일 겪는 불편한 순간을 그대로 보여주거나, 그 순간을 찌르는 질문으로 시작합니다. 제품은 아직 등장시키지 않습니다.
- Agitation & Solution (role "benefit"): 그 불편함에 공감하며 파고든 뒤, 핵심 강점을 자연스러운 해결책으로 등장시킵니다. 스펙을 늘어놓지 말고 "그래서 뭐가 달라지는지"를 보여줍니다.
- Proof (role "proof"): 참고 사항을 반영해 주장을 뒷받침하는 시각적 증명(비교·테스트·디테일 클로즈업) 또는 실제 후기 인용. 후기는 브리프·참고 사항에 있는 것만 인용하고, 없으면 확인 가능한 제품 특성을 눈으로 보여줍니다. 가짜 후기 작성 금지.
- Offer & CTA (role "offer"): 프로모션·혜택을 강조하고 행동 유도로 마무리합니다. 브리프에 프로모션이 없으면 role "cta"로 두고 행동 유도에 집중합니다.
- 각 장면 id는 영문 소문자·숫자·밑줄만 쓴 짧은 슬러그 (예: hook_swollen_feet, proof_wash_test, offer_week). 중복 금지.

## 장면 필드
- visual: 화면 묘사. 한국어 1~2문장으로 어떤 상황·피사체·동작·컷을 보여줄지 구체적으로 (예: "퇴근길 지하철, 구두를 반쯤 벗고 발뒤꿈치를 문지르는 발 클로즈업").
- headline: 화면의 굵은 텍스트 자막. 한국어 7~14음절, 1~2줄이며 줄바꿈은 \\n 하나. 형용사 나열 금지, 동사와 구체 명사로.
  Hook 자막은 타깃의 속마음이나 상황을 1인칭·구어로 찌릅니다. 브랜드명을 지우고 경쟁사를 넣어도 성립하는 카피, 전략 요약("새로운 경험", "프리미엄 품질")은 버립니다.
- kicker: 8자 이내 짧은 라벨. 영문 대문자 또는 한글 (예: "공감 100%", "REAL REVIEW", "이번 주만").
- sub: 15~25자 보조 자막. headline을 반복하지 말고 headline이 못 한 정보를 줍니다.
- narration: 내레이션. 선택된 내레이션 음성의 톤에 맞춘 자연스러운 한국어 구어체 대사. 장면 계획에 적힌 장면별 글자 수(공백 포함) 이내로 씁니다. 넘치면 영상이 목표 길이보다 길어집니다.
  광고 문어체("~를 선사합니다") 금지. 친구에게 말하듯 짧게 끊습니다. 마지막 장면은 행동을 구체적으로 지시합니다.
- 숫자·할인율·기간·수상·순위·리뷰 수는 브리프에 적힌 값만 씁니다. 없는 수치를 만들지 않습니다. 필요하면 수치 없이 씁니다.
- 참고 사항에 금지 항목이 있으면 절대 쓰지 않습니다.

## cta 객체 (엔드카드)
- headline: 브랜드명 또는 캠페인명 7~12음절. sub: 행동 유도 문장(브리프의 행동 유도 반영). badge: 6~10자 뱃지 (예: "인기 사이즈 소진 중", "9/20까지"). 뱃지의 날짜·수량도 브리프 값만.

## prompt (영상 생성 프롬프트) — kind 가 clips 일 때만
- visual 을 영어로 옮겨 60~110 단어. "Vertical 9:16."로 시작. 장소·피사체·동작·카메라 무빙·조명·분위기를 구체적으로.
- Hook·공감 장면은 불편한 일상 상황을 실감 나게, 해결·증명 장면은 제품을 실사처럼 묘사 (색·소재·형태). 사람 얼굴 클로즈업보다 손·발·제품·상황 위주.
- 마지막에 항상: "Shot on a cinema camera, shallow depth of field, natural color grading, premium commercial. No on-screen text, no logos, no captions, no watermark."
- kind 가 photos 이면 prompt 는 빈 문자열.

## seconds
- 장면 계획의 seconds 값을 그대로 씁니다.`;

export type GenerateInput = {
  brief: ShortFormBrief;
  kind: TemplateKind;
  preset: DurationPreset;
  voice?: string;
  clientName?: string | null;
  clientIndustry?: string | null;
};

export function describeApiError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/credit balance/i.test(raw)) return "Anthropic API 크레딧이 부족해요. console.anthropic.com → Plans & Billing에서 충전한 뒤 다시 실행해 주세요.";
  if (e instanceof Anthropic.AuthenticationError) return "ANTHROPIC_API_KEY가 유효하지 않아요. 서버 환경변수를 확인해 주세요.";
  if (e instanceof Anthropic.RateLimitError) return "API 요청 한도에 걸렸어요. 1분 뒤 다시 시도해 주세요.";
  if (e instanceof Anthropic.APIConnectionError) return "Anthropic API에 연결하지 못했어요. 네트워크를 확인해 주세요.";
  if (e instanceof Anthropic.APIError) return `Anthropic API 오류(${e.status ?? "?"}): ${raw.replace(/^\d+\s*/, "").slice(0, 200)}`;
  return raw || "스크립트 생성 중 오류가 발생했어요.";
}

function parseJson<T>(t: string): T {
  try {
    return JSON.parse(t) as T;
  } catch {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s >= 0 && e > s) return JSON.parse(t.slice(s, e + 1)) as T;
    throw new Error("AI 응답을 해석하지 못했어요.");
  }
}

export async function generateScript(input: GenerateInput): Promise<ShortFormScript> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const b = input.brief;
  const lines = [
    `kind: ${input.kind}`,
    `브랜드명: ${b.brand || input.clientName || "(미입력)"}`,
    input.clientIndustry ? `업종: ${input.clientIndustry}` : "",
    `제품·서비스: ${b.product}`,
    `타깃: ${b.audience || "(미입력 — 제품에서 추정하고, 그 타깃의 일상적인 불편을 먼저 정의)"}`,
    `핵심 강점: ${b.benefit}`,
    `프로모션·혜택: ${b.offer || "(없음 — 마지막 장면은 role cta 로 행동 유도에 집중)"}`,
    `행동 유도: ${b.cta || "(미입력 — '하단 링크에서 확인하기' 계열로)"}`,
    `톤앤매너: ${b.tone || "(미입력 — 브랜드·제품에 맞게 판단)"}`,
    `참고 사항: ${b.notes || "(없음)"}`,
    `내레이션 음성: ${VOICES.find((v) => v.id === input.voice)?.label ?? VOICES[0].label}`,
  ].filter(Boolean);
  const preset = input.preset;
  const plan = [
    `## 장면 계획 — 목표 길이 ${preset.seconds}초 (${preset.name}: ${preset.fit}) · 장면 ${preset.beats.length}개 + 엔드카드 ${preset.endSeconds}초`,
    ...preset.beats.map((bt, i) => {
      const start = preset.beats.slice(0, i).reduce((a, x) => a + x.seconds, 0);
      const role = bt.role === "offer" && !b.offer ? "cta" : bt.role;
      return `${i + 1}. [${start}~${start + bt.seconds}초] ${bt.stage} — role "${role}", seconds ${bt.seconds}, 내레이션 ${narrationBudget(bt.seconds)}자 이내: ${bt.guide}`;
    }),
  ];

  const request = (withSchema: boolean) =>
    anthropic.messages
      .stream({
        model: "claude-opus-5",
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        output_config: withSchema
          ? { effort: "medium", format: { type: "json_schema", schema: SCRIPT_SCHEMA } }
          : { effort: "medium" },
        system: withSchema
          ? SYSTEM
          : `${SYSTEM}\n\n## JSON 형식\n반드시 아래 스키마를 만족하는 JSON 객체 하나만 출력합니다.\n${JSON.stringify(SCRIPT_SCHEMA)}`,
        messages: [{ role: "user", content: `다음 브리프로 기획 의도(concept)를 먼저 정하고, 그 스토리라인대로 장면 계획에 맞춰 숏폼 스크립트를 쓰세요.\n\n## 브리프\n${lines.join("\n")}\n\n${plan.join("\n")}` }],
      })
      .finalMessage();

  let msg: Awaited<ReturnType<typeof request>>;
  try {
    msg = await request(true);
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e);
    if (e instanceof Anthropic.BadRequestError && /grammar|schema/i.test(text)) msg = await request(false);
    else throw e;
  }
  if (msg.stop_reason === "refusal") throw new Error("모델이 이 브리프에 대한 응답을 거절했어요. 내용을 확인해 주세요.");
  if (msg.stop_reason === "max_tokens") throw new Error("응답이 길어 잘렸어요. 다시 시도해 주세요.");
  const text = msg.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  const script = normalizeScript(parseJson(text), { kind: input.kind, voice: input.voice });
  if (!script.scenes.length) throw new Error("장면이 비어 있는 스크립트가 왔어요. 다시 시도해 주세요.");
  if (!script.brand) script.brand = b.brand || input.clientName || "";
  // 장면 길이는 모델 출력 대신 장면 계획 값으로 고정한다 (장면 수가 계획과 같을 때)
  if (script.scenes.length === preset.beats.length) script.scenes.forEach((sc, i) => (sc.seconds = preset.beats[i].seconds));
  script.targetSeconds = preset.seconds;
  script.endSeconds = preset.endSeconds;
  return script;
}
