// 인스타 시각 분석 — 서버 전용. 게시물 썸네일(릴스는 커버)을 내려받아 Claude 비전으로 태깅한다.
// 사람(얼굴·신체 일부·없음) · 피사체(제품 단독·착용/사용·라이프스타일·텍스트/그래픽) · 톤(밝음·중간·어두움) · 이미지 위 글자 유무.
// 인스타 CDN 주소는 며칠 뒤 만료 → 분석 직후에 돌려야 이미지가 받아진다. 받지 못한 게시물은 건너뛰고 개수를 알려 준다.
// 스키마에는 enum을 넣지 않고(문법 크기) 값은 코드에서 정규화. 비용: 이미지 24장 기준 입력 약 4만 토큰.
import Anthropic from "@anthropic-ai/sdk";
import type { InstagramProfile } from "./apifyClient";
import { computeAccountMetrics } from "./postMetrics";
import { PEOPLE, SUBJECTS, TONES, type VisualResult, type VisualTag } from "./visualTypes";

const MAX_IMAGES = 24;
const MODEL = "claude-sonnet-5-5";

const SCHEMA = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          people: { type: "string" },
          subject: { type: "string" },
          tone: { type: "string" },
          textOverlay: { type: "boolean" },
          overlayText: { type: "string" },
        },
        required: ["id", "people", "subject", "tone", "textOverlay", "overlayText"],
        additionalProperties: false,
      },
    },
  },
  required: ["posts"],
  additionalProperties: false,
};

const SYSTEM = `당신은 인스타그램 광고 크리에이티브를 분류하는 시각 분석가입니다. 각 이미지는 게시물의 대표 이미지(릴스는 커버 = 첫 화면)입니다.
이미지마다 아래 값을 정확히 하나씩 고르세요. 보이는 것만 판단하고 추측하지 마세요.
- people: ${PEOPLE.join(" | ")} — 사람 얼굴이 보이면 "얼굴", 손·발·다리 등만 보이면 "신체 일부", 사람이 없으면 "없음"
- subject: ${SUBJECTS.join(" | ")} — 제품만 놓인 컷은 "제품 단독", 사람이 제품을 신거나 쓰는 컷은 "착용·사용", 일상·풍경 중심은 "라이프스타일", 글자·도형 위주 카드뉴스는 "텍스트·그래픽"
- tone: ${TONES.join(" | ")} — 전체 밝기
- textOverlay: 이미지 위에 덧씌운 글자(자막·카피·훅 문구)가 있으면 true. 제품에 인쇄된 로고는 제외
- overlayText: 덧씌운 글자를 40자 이내로 그대로 옮김(없으면 빈 문자열)
출력은 지정된 JSON 스키마의 객체 하나뿐입니다. 입력된 id를 그대로 쓰세요.`;

async function fetchImage(url: string): Promise<{ data: string; media: "image/jpeg" | "image/png" | "image/webp" | "image/gif" } | null> {
  if (!/^https?:\/\//.test(url)) return null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0", Accept: "image/*" }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    const media = (["image/jpeg", "image/png", "image/webp", "image/gif"].includes(ct) ? ct : "image/jpeg") as "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500 || buf.length > 4_500_000) return null;
    return { data: buf.toString("base64"), media };
  } catch {
    return null;
  }
}

const pick = <T extends readonly string[]>(list: T, v: string, fallback: T[number]): T[number] => (list.find((x) => v?.includes(x)) ?? fallback) as T[number];

export async function analyzeVisuals(profile: InstagramProfile): Promise<VisualResult> {
  // 비교 가능한(반응 집계가 끝난·좋아요 공개) 게시물 우선, 최신순
  const metrics = computeAccountMetrics(profile);
  const candidates = metrics.posts
    .filter((m) => m.post.thumbnail)
    .sort((a, b) => Number(b.tier !== "new" && b.tier !== "na") - Number(a.tier !== "new" && a.tier !== "na"))
    .slice(0, MAX_IMAGES);

  const images: { id: string; format: string; img: NonNullable<Awaited<ReturnType<typeof fetchImage>>> }[] = [];
  for (let i = 0; i < candidates.length; i += 6) {
    const part = await Promise.all(candidates.slice(i, i + 6).map(async (m) => ({ id: m.post.id, format: m.post.format, img: await fetchImage(m.post.thumbnail) })));
    for (const p of part) if (p.img) images.push(p as (typeof images)[number]);
  }
  if (!images.length) throw new Error("게시물 이미지를 받지 못했어요. 인스타그램 이미지 주소는 며칠 뒤 만료돼요 — '다시 분석'으로 새로 수집한 뒤 바로 실행해 주세요.");

  const content: Anthropic.ContentBlockParam[] = [];
  for (const im of images) {
    content.push({ type: "text", text: `id: ${im.id} (${im.format === "reel" ? "릴스 커버" : im.format === "carousel" ? "캐러셀 첫 장" : "이미지"})` });
    content.push({ type: "image", source: { type: "base64", media_type: im.img.media, data: im.img.data } });
  }
  content.push({ type: "text", text: `위 ${images.length}개 이미지를 분류해 posts 배열로 돌려주세요.` });

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, timeout: 110_000 });
  const msg = (await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: 12000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as never,
    thinking: { type: "adaptive" },
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  } as never)) as Anthropic.Beta.BetaMessage;
  if (msg.stop_reason === "refusal") throw new Error("AI가 이미지 분석을 거절했어요.");
  const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let parsed: { posts?: Record<string, unknown>[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("시각 분석 응답을 해석하지 못했어요. 다시 시도해 주세요.");
  }
  const valid = new Set(images.map((i) => i.id));
  const posts: VisualTag[] = (parsed.posts ?? [])
    .filter((p) => valid.has(String(p.id)))
    .map((p) => ({
      id: String(p.id),
      people: pick(PEOPLE, String(p.people ?? ""), "없음"),
      subject: pick(SUBJECTS, String(p.subject ?? ""), "기타"),
      tone: pick(TONES, String(p.tone ?? ""), "중간"),
      textOverlay: Boolean(p.textOverlay),
      overlayText: String(p.overlayText ?? "").slice(0, 40),
    }));
  return { posts, analyzed: posts.length, skipped: candidates.length - images.length };
}
