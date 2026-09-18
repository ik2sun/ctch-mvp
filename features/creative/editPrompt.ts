import Anthropic from "@anthropic-ai/sdk";
import { EDIT_TOOL_BY_ID, type EditPromptResult, type EditToolId } from "./editTools";

// 서버 전용 — 이미지 + 수정 요청 → 도구별 수정 프롬프트 (Claude 비전 + 구조화 출력).
// 거절(refusal) 시 서버측 폴백으로 claude-opus-4-8 이 이어 받는다.

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "analysis", "keep", "changes", "prompt", "negative", "params", "howTo"],
  properties: {
    title: { type: "string" },
    analysis: { type: "string" },
    keep: { type: "array", items: { type: "string" } },
    changes: { type: "array", items: { type: "string" } },
    prompt: { type: "string" },
    negative: { type: "string" },
    params: { type: "string" },
    howTo: { type: "string" },
  },
} as const;

const SYSTEM = `당신은 광고 비주얼을 다루는 아트 디렉터이자 이미지 생성 프롬프트 엔지니어입니다.
사용자가 올린 이미지와 한국어 수정 요청을 받아, 지정된 도구에서 바로 쓸 수 있는 완성도 높은 수정 프롬프트를 만듭니다.
출력은 지정된 JSON 스키마의 객체 하나뿐입니다.

## 순서
1. 이미지를 먼저 정확히 파악한다: 피사체(제품이면 형태·색·소재·로고 위치), 구도·앵글, 배경, 조명 방향과 질감, 색감, 분위기. analysis 에 한국어 2~3문장.
2. 수정 요청을 해석한다. 요청이 모호하면 광고 소재로서 가장 설득력 있는 해석을 고르고, 그 해석을 changes 에 드러낸다.
3. keep: 바꾸면 안 되는 요소를 구체 명사로 (예: "제품 실루엣과 로고 위치", "모델의 얼굴"). 요청이 명시적으로 바꾸라는 것은 넣지 않는다. 3~6개, 한국어.
4. changes: 실제로 바뀌는 점을 한국어로 3~6개. 짧고 구체적으로.
5. prompt: 도구 형식 지침을 따른다. 원본의 조명·원근·색온도와 새 요소가 자연스럽게 섞이도록 조명과 그림자 일치를 명시한다. 제품 광고라면 제품이 주인공으로 선명하게 보이게.
6. howTo: 이 도구에서 원본과 프롬프트를 어떻게 넣어 쓰는지 한국어 1~3문장.
7. title: 수정안을 한 줄로 (한국어, 20자 이내).

## 원칙
- 이미지에 없는 브랜드명·수치·문구를 지어내지 않는다. 글자를 넣으라는 요청이 있을 때만 정확한 문구를 쓴다.
- 실존 인물을 특정하거나 닮게 만들지 않는다.
- 비율 지정이 있으면 prompt/params 에 반영하고, '원본'이면 원본 비율을 유지하라고 쓴다.`;

export async function buildEditPrompt(input: {
  image: { data: Buffer; mimeType: string } | { url: string };
  request: string;
  tool: EditToolId;
  aspectRatio: string;
}): Promise<EditPromptResult> {
  const tool = EDIT_TOOL_BY_ID[input.tool] ?? EDIT_TOOL_BY_ID.general;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const imageBlock: Anthropic.Beta.BetaImageBlockParam =
    "url" in input.image
      ? { type: "image", source: { type: "url", url: input.image.url } }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: input.image.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
            data: input.image.data.toString("base64"),
          },
        };

  const msg = await anthropic.beta.messages
    .stream({
      model: "claude-opus-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: "claude-opus-4-8" }],
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            imageBlock,
            {
              type: "text",
              text: [
                `## 도구: ${tool.name}`,
                `형식 지침: ${tool.guide}`,
                `## 비율: ${input.aspectRatio || "원본"}`,
                `## 수정 요청`,
                input.request.trim() || "(요청 없음 — 광고 소재로서 완성도를 높이는 방향으로 제안)",
              ].join("\n"),
            },
          ],
        },
      ],
    })
    .finalMessage();

  if (msg.stop_reason === "refusal") throw new Error("이 이미지나 요청은 처리할 수 없어요. 내용을 바꿔 다시 시도해 주세요.");
  if (msg.stop_reason === "max_tokens") throw new Error("응답이 길어 잘렸어요. 다시 시도해 주세요.");
  const text = msg.content
    .filter((c): c is Anthropic.Beta.BetaTextBlock => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  let raw: Partial<EditPromptResult>;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("AI 응답을 해석하지 못했어요. 다시 시도해 주세요.");
  }
  const arr = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  return {
    title: String(raw.title ?? "").trim(),
    analysis: String(raw.analysis ?? "").trim(),
    keep: arr(raw.keep),
    changes: arr(raw.changes),
    prompt: String(raw.prompt ?? "").trim(),
    negative: String(raw.negative ?? "").trim(),
    params: String(raw.params ?? "").trim(),
    howTo: String(raw.howTo ?? "").trim(),
  };
}
