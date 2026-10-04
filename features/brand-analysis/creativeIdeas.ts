// 넥스트 베스트 액션 — 성과 좋은 게시물 하나를 바탕으로 숏폼 스크립트 + 광고 카피(메타·네이버/카카오 DA)를 제안. 서버 전용.
// 수치·혜택은 지어내지 않는다(캡션·지표에 있는 것만). 결과는 저장하지 않고 화면에서 복사·숏폼 제작으로 넘긴다.
import Anthropic from "@anthropic-ai/sdk";
import type { InstagramPost } from "./apifyClient";
import type { PostTag } from "./diagnosisTypes";
import type { VisualTag } from "./visualTypes";

export type CreativeIdeas = {
  why: string;
  shortform: { title: string; hook: string; scenes: { seconds: string; visual: string; text: string }[]; cta: string };
  metaAd: { primaryText: string; headline: string; cta: string };
  displayAd: { title: string; description: string };
  shotList: string[];
};

const SCHEMA = {
  type: "object",
  properties: {
    why: { type: "string" },
    shortform: {
      type: "object",
      properties: {
        title: { type: "string" },
        hook: { type: "string" },
        scenes: {
          type: "array",
          items: { type: "object", properties: { seconds: { type: "string" }, visual: { type: "string" }, text: { type: "string" } }, required: ["seconds", "visual", "text"], additionalProperties: false },
        },
        cta: { type: "string" },
      },
      required: ["title", "hook", "scenes", "cta"],
      additionalProperties: false,
    },
    metaAd: {
      type: "object",
      properties: { primaryText: { type: "string" }, headline: { type: "string" }, cta: { type: "string" } },
      required: ["primaryText", "headline", "cta"],
      additionalProperties: false,
    },
    displayAd: {
      type: "object",
      properties: { title: { type: "string" }, description: { type: "string" } },
      required: ["title", "description"],
      additionalProperties: false,
    },
    shotList: { type: "array", items: { type: "string" } },
  },
  required: ["why", "shortform", "metaAd", "displayAd", "shotList"],
  additionalProperties: false,
};

const SYSTEM = `당신은 인스타그램 성과 데이터를 광고 소재로 바꾸는 퍼포먼스 크리에이티브 디렉터입니다.
반응이 좋았던 게시물 하나의 정보(캡션·포맷·성과 배수·AI 태그·시각 태그)를 보고, 같은 구도와 훅을 살린 다음 소재를 기획합니다.
- why: 이 게시물이 잘 된 이유 1~2문장(주어진 지표·태그 근거만)
- shortform: 내일 바로 찍을 수 있는 15~20초 세로 숏폼. hook은 첫 2초 화면 문구, scenes는 3~5개(seconds 예 "0-2초", visual=촬영 구도, text=화면 자막), cta는 엔드카드 문구
- metaAd: 메타 피드 광고. primaryText 125자 이내, headline 27자 이내, cta는 '쇼핑하기·더 알아보기' 같은 버튼 문구
- displayAd: 네이버 GFA·카카오 비즈보드용. title 15자 이내, description 45자 이내
- shotList: 촬영 체크리스트 3~5개(원본 구도 재현 포인트)
규칙: 가격·할인율·수치·수상 내역은 캡션에 있는 것만 쓴다. 없으면 쓰지 않는다. 형용사보다 동사·구체 명사. 한국어. 출력은 JSON 스키마 객체 하나뿐.`;

export async function generateCreativeIdeas(input: {
  brand: string;
  post: InstagramPost;
  score: { mode: "er" | "comments"; value: number | null }; // 화면 비교와 같은 점수(좋아요 비공개가 많으면 댓글 배수)
  viewRate: number | null;
  tag: PostTag | null;
  visual: VisualTag | null;
}): Promise<CreativeIdeas> {
  const { post } = input;
  const payload = {
    브랜드: input.brand,
    포맷: post.format === "reel" ? "릴스" : post.format === "carousel" ? "캐러셀" : "이미지",
    [input.score.mode === "er" ? "계정중앙값대비참여율배수" : "계정중앙값대비댓글수배수(좋아요비공개계정)"]: input.score.value != null ? Number(input.score.value.toFixed(2)) : null,
    릴스조회율: input.viewRate != null ? Number(input.viewRate.toFixed(2)) : null,
    캡션: post.caption.slice(0, 1200),
    해시태그: post.hashtags.slice(0, 15),
    AI태그: input.tag ? { 유형: input.tag.contentType, 훅: input.tag.hookType, CTA: input.tag.ctaType, 인사이트: input.tag.insight } : null,
    시각태그: input.visual ? { 사람: input.visual.people, 피사체: input.visual.subject, 톤: input.visual.tone, 이미지위글자: input.visual.overlayText || (input.visual.textOverlay ? "있음" : "없음") } : null,
  };
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, timeout: 90_000 });
  const msg = (await anthropic.beta.messages.create({
    model: "claude-sonnet-5-5",
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as never,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(payload, null, 2) }],
  } as never)) as Anthropic.Beta.BetaMessage;
  if (msg.stop_reason === "refusal") throw new Error("AI가 요청을 거절했어요.");
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  try {
    return JSON.parse(text) as CreativeIdeas;
  } catch {
    throw new Error("소재 추천 응답을 해석하지 못했어요. 다시 시도해 주세요.");
  }
}
