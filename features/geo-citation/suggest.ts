// 서버 전용 — 대상 페이지(JS 미실행 HTML·JSON-LD)에서 비브랜드 질문 초안을 뽑는다.
// 원칙(geo-audit-framework 1단계): 질문은 지어내지 않고 페이지 원문에서 추출, 근거를 함께 남긴다.
// 범용 조건(카테고리 추천)과 고유 조건(수치·성분·효능 검증형)을 섞고 여정 4단계로 분산한다.
import Anthropic from "@anthropic-ai/sdk";
import { runAudit } from "@/features/seo-analysis/audit";
import { JOURNEY_STAGES, type JourneyStage } from "./types";

export type SuggestedPrompt = { query: string; stage: JourneyStage; evidence: string };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prompts"],
  properties: {
    prompts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["query", "stage", "evidence"],
        properties: {
          query: { type: "string" },
          stage: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
  },
};

const SYSTEM = `당신은 GEO(생성형 검색 최적화) 측정 설계자입니다. AI 검색 엔진(ChatGPT·Gemini·Claude)에 그대로 던질 한국어 질문 세트를 만듭니다.

규칙
- 전부 비브랜드 질문: 대상 브랜드명·제품 고유명·도메인을 질문에 넣지 않는다. 실제 소비자가 검색창에 칠 법한 자연스러운 문장.
- 질문은 지어내지 않는다. 제공된 페이지 원문(title·h1·h2·FAQ·JSON-LD·첫 단락)에 근거가 있는 주제만 다룬다. evidence에는 근거가 된 원문 구절을 짧게 그대로 옮긴다.
- 범용 조건(카테고리 일반 추천·비교)과 고유 조건(페이지 고유 수치·성분·기능·효능을 검증하는 질문)을 섞는다.
- stage는 ${JOURNEY_STAGES.join(" / ")} 중 하나. 비교 의도로 편중되지 않게 4단계에 고르게 나누고, 정보 탐색(지식 질문)은 최소 3개.
- 수치를 새로 만들지 않는다. 질문 수는 요청된 개수를 따른다.`;

export async function suggestPrompts(input: { url: string; brandTerms: string[]; count: number; existing: string[] }): Promise<SuggestedPrompt[]> {
  const audit = await runAudit(input.url);
  const page = {
    url: audit.finalUrl,
    title: audit.page.title,
    metaDescription: audit.page.metaDescription,
    h1: audit.page.h1,
    h2: audit.page.h2.slice(0, 30),
    firstParagraph: audit.citability.firstParagraph,
    questionHeadings: audit.citability.questionHeadings,
    faq: audit.schema.faqQuestions,
    schemaTypes: audit.schema.types,
    jsonLd: audit.schema.rawJsonLd,
  };
  if (!page.title && page.h1.length === 0 && !page.jsonLd) throw new Error("페이지에서 읽을 수 있는 내용이 없어요(JS 렌더링 사이트일 수 있어요). 질문을 직접 입력해 주세요.");

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const msg = await anthropic.messages
    .stream({
      model: "claude-opus-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            `질문 ${input.count}개를 만들어 주세요.`,
            `질문에 넣으면 안 되는 브랜드 표기: ${input.brandTerms.join(", ") || "(페이지에서 판단)"}`,
            input.existing.length ? `이미 등록된 질문(중복 금지):\n${input.existing.map((q) => `- ${q}`).join("\n")}` : "",
            `## 페이지 데이터\n${JSON.stringify(page, null, 1)}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    })
    .finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("모델이 이 요청에 응답하지 않았어요.");
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
  let parsed: { prompts?: SuggestedPrompt[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("AI 응답을 해석하지 못했어요. 다시 시도해 주세요.");
  }
  const brand = input.brandTerms.map((b) => b.toLowerCase()).filter((b) => b.length >= 2);
  return (parsed.prompts ?? [])
    .map((p) => ({
      query: String(p.query ?? "").trim(),
      stage: (JOURNEY_STAGES as readonly string[]).includes(p.stage) ? p.stage : "정보 탐색",
      evidence: String(p.evidence ?? "").trim().slice(0, 300),
    }))
    .filter((p) => p.query && !brand.some((b) => p.query.toLowerCase().includes(b)));
}
