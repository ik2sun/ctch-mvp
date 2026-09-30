// 서버 전용 — 엔진별 "웹 검색을 켠 API"로 질문 1건을 묻고 답변 원문·인용 URL을 돌려준다.
// 주의: API 응답은 사람이 쓰는 ChatGPT·Gemini·Claude 화면과 같지 않다(개인화·로그인·UI 전용 기능 없음).
// 시스템 프롬프트 없이 질문만 보낸다 — 매 호출이 새 세션.
import Anthropic from "@anthropic-ai/sdk";
import type { ApiEngine } from "./types";

export type RawCitation = { url: string; title?: string; domain?: string };
export type EngineResult = {
  model: string;
  answer: string;
  citations: RawCitation[]; // 답변이 실제로 인용한 출처(첫 등장 순)
  sources: RawCitation[]; // 검색은 했으나 인용되지 않은 결과
  usage: Record<string, number>;
  costUsd: number | null; // 단가를 확실히 아는 엔진만
};

export class EngineError extends Error {}

export const ENGINE_ENV: Record<ApiEngine, string> = {
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export function engineReady(engine: ApiEngine): boolean {
  return Boolean(process.env[ENGINE_ENV[engine]]);
}

export const ENGINE_MODEL: Record<ApiEngine, () => string> = {
  claude: () => "claude-opus-5",
  openai: () => process.env.GEO_OPENAI_MODEL || "gpt-5",
  // 추이 비교가 흔들리지 않도록 별칭(-latest) 대신 버전을 고정. gemini-2.5-flash는 신규 사용자 차단(2026-09-29 확인)
  gemini: () => process.env.GEO_GEMINI_MODEL || "gemini-3.8-flash",
};

const TIMEOUT_MS = 150_000;

// ---------------------------------------------------------------- Claude (web_search 서버 도구)
// 단가: Opus 5 입력 $5 / 출력 $25 per 1M, 웹 검색 $10 / 1,000회
async function askClaude(query: string): Promise<EngineResult> {
  const model = ENGINE_MODEL.claude();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY!, timeout: TIMEOUT_MS });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: query }];
  const content: Anthropic.Beta.BetaContentBlock[] = [];
  const usage = { input_tokens: 0, output_tokens: 0, web_search_requests: 0 };

  // 서버 도구 루프가 길면 pause_turn으로 멈추므로 이어서 요청한다(최대 3회)
  for (let i = 0; i < 3; i++) {
    const msg = await anthropic.beta.messages
      .stream({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-06-01"],
        fallbacks: [{ model: "claude-opus-4-8" }],
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        // 기본형 web_search를 쓴다. 20260209(동적 필터링)는 검색을 코드 실행으로 돌려 답변에 citations가
        // 붙지 않았고 응답도 2분 넘게 걸렸다(2026-09-29 실측). 기본형은 약 30초·인용 정상.
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 5,
            user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" },
          },
        ],
        messages,
      })
      .finalMessage();
    content.push(...msg.content);
    usage.input_tokens += msg.usage.input_tokens ?? 0;
    usage.output_tokens += msg.usage.output_tokens ?? 0;
    usage.web_search_requests += msg.usage.server_tool_use?.web_search_requests ?? 0;
    if (msg.stop_reason === "refusal") throw new EngineError("Claude가 이 질문에 답하지 않았어요(refusal).");
    if (msg.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: msg.content });
  }

  const citations: RawCitation[] = [];
  const sources: RawCitation[] = [];
  const texts: string[] = [];
  for (const block of content) {
    if (block.type === "text") {
      texts.push(block.text);
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location") citations.push({ url: c.url, title: c.title ?? "" });
      }
    } else if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) if (r.type === "web_search_result") sources.push({ url: r.url, title: r.title });
    }
  }
  const costUsd = (usage.input_tokens * 5 + usage.output_tokens * 25) / 1_000_000 + usage.web_search_requests * 0.01;
  // 모델이 가끔 <cite …> 태그를 본문에 그대로 내보낸다
  const answer = texts.join("").replace(/<\/?cite(?:\s[^<>\n]*)?>?/g, "").trim();
  return { model, answer, citations, sources, usage, costUsd };
}

// ---------------------------------------------------------------- OpenAI (Responses API + web_search)
type OpenAIOutput = {
  type: string;
  action?: { sources?: { type?: string; url?: string; title?: string }[] };
  content?: { type: string; text?: string; annotations?: { type: string; url?: string; title?: string; start_index?: number }[] }[];
};

async function askOpenAI(query: string): Promise<EngineResult> {
  const model = ENGINE_MODEL.openai();
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model,
      input: query,
      tools: [{ type: "web_search", user_location: { type: "approximate", country: "KR", timezone: "Asia/Seoul" } }],
      include: ["web_search_call.action.sources"],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as {
    output?: OpenAIOutput[];
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: { message?: string; code?: string };
  } | null;
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    if (json?.error?.code === "insufficient_quota" || /no credits|quota|billing/i.test(msg)) {
      throw new EngineError("OpenAI API 크레딧이 없어요. platform.openai.com → Settings → Billing에서 충전해 주세요.");
    }
    if (res.status === 401) throw new EngineError("OPENAI_API_KEY가 유효하지 않아요.");
    if (res.status === 404 || /model/i.test(msg)) throw new EngineError(`OpenAI 모델(${model})을 쓸 수 없어요: ${msg.slice(0, 160)} — GEO_OPENAI_MODEL로 바꿀 수 있어요.`);
    throw new EngineError(`OpenAI 호출 실패: ${msg.slice(0, 200)}`);
  }

  const texts: string[] = [];
  const citations: RawCitation[] = [];
  const sources: RawCitation[] = [];
  for (const item of json?.output ?? []) {
    if (item.type === "web_search_call") {
      for (const s of item.action?.sources ?? []) if (s.url) sources.push({ url: s.url, title: s.title });
    }
    if (item.type === "message") {
      for (const c of item.content ?? []) {
        if (c.type !== "output_text") continue;
        texts.push(c.text ?? "");
        const anns = [...(c.annotations ?? [])].sort((a, b) => (a.start_index ?? 0) - (b.start_index ?? 0));
        for (const a of anns) if (a.type === "url_citation" && a.url) citations.push({ url: stripUtm(a.url), title: a.title });
      }
    }
  }
  return {
    model,
    answer: texts.join("\n").trim(),
    citations,
    sources: sources.map((s) => ({ ...s, url: stripUtm(s.url) })),
    usage: { input_tokens: json?.usage?.input_tokens ?? 0, output_tokens: json?.usage?.output_tokens ?? 0 },
    costUsd: null,
  };
}

// ChatGPT는 인용 URL에 utm_source=openai를 붙인다 — 도메인 집계를 위해 제거
function stripUtm(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------- Gemini (Google Search grounding)
type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
    groundingMetadata?: {
      groundingChunks?: { web?: { uri?: string; title?: string } }[];
      groundingSupports?: { groundingChunkIndices?: number[]; segment?: { startIndex?: number } }[];
    };
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  error?: { message?: string; status?: string };
};

// grounding URI는 vertexaisearch 리다이렉트 — 실제 URL을 얻기 위해 Location 헤더만 읽는다
async function resolveRedirect(uri: string): Promise<string> {
  if (!/grounding-api-redirect/.test(uri)) return uri;
  try {
    const res = await fetch(uri, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000) });
    return res.headers.get("location") || uri;
  } catch {
    return uri;
  }
}

async function askGemini(query: string): Promise<EngineResult> {
  const model = ENGINE_MODEL.gemini();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: query }] }], tools: [{ google_search: {} }] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = (await res.json().catch(() => null)) as GeminiResponse | null;
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) throw new EngineError(`GEMINI_API_KEY 인증 실패 (${res.status}).`);
    if (res.status === 402 || /credits are depleted|prepay|billing/i.test(msg)) {
      throw new EngineError("Gemini API 선불 크레딧이 소진됐어요. ai.studio → 프로젝트 → Billing에서 충전해 주세요.");
    }
    if (res.status === 404) throw new EngineError(`Gemini 모델(${model})을 쓸 수 없어요: ${msg.slice(0, 160)} — GEO_GEMINI_MODEL로 바꿀 수 있어요.`);
    if (res.status === 429) throw new EngineError("Gemini 요청 한도 초과(429). 잠시 후 다시 시도해 주세요.");
    throw new EngineError(`Gemini 호출 실패: ${msg.slice(0, 200)}`);
  }
  const cand = json?.candidates?.[0];
  const answer = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
  const supports = [...(cand?.groundingMetadata?.groundingSupports ?? [])].sort(
    (a, b) => (a.segment?.startIndex ?? 0) - (b.segment?.startIndex ?? 0),
  );
  // 답변 문장에 연결된 청크만 "인용", 나머지는 "검색 결과"
  const citedOrder: number[] = [];
  for (const s of supports) for (const i of s.groundingChunkIndices ?? []) if (!citedOrder.includes(i)) citedOrder.push(i);
  const resolved = await Promise.all(
    chunks.map(async (c) => ({ url: await resolveRedirect(c.web?.uri ?? ""), title: c.web?.title ?? "" })),
  );
  // 리다이렉트를 못 풀면 title(대개 도메인)을 도메인으로 쓴다
  const toCitation = (r: { url: string; title: string }): RawCitation => ({
    url: r.url,
    title: r.title,
    domain: /grounding-api-redirect/.test(r.url) ? r.title.toLowerCase().replace(/^www\./, "") : undefined,
  });
  const citations = citedOrder.map((i) => resolved[i]).filter(Boolean).map(toCitation);
  const sources = resolved.filter((_, i) => !citedOrder.includes(i)).map(toCitation);
  if (!answer && cand?.finishReason) throw new EngineError(`Gemini가 답하지 않았어요 (${cand.finishReason}).`);
  return {
    model,
    answer,
    citations,
    sources,
    usage: {
      input_tokens: json?.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: (json?.usageMetadata?.candidatesTokenCount ?? 0) + (json?.usageMetadata?.thoughtsTokenCount ?? 0),
    },
    costUsd: null,
  };
}

export async function askEngine(engine: ApiEngine, query: string): Promise<EngineResult> {
  if (!engineReady(engine)) throw new EngineError(`서버에 ${ENGINE_ENV[engine]}가 없어요. .env.local(배포 환경은 Vercel 환경변수)에 추가해 주세요.`);
  try {
    if (engine === "claude") return await askClaude(query);
    if (engine === "openai") return await askOpenAI(query);
    return await askGemini(query);
  } catch (e) {
    if (e instanceof EngineError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new EngineError("ANTHROPIC_API_KEY 인증 실패.");
    if (e instanceof Anthropic.RateLimitError) throw new EngineError("Claude 요청 한도 초과(429). 잠시 후 다시 시도해 주세요.");
    if (e instanceof Anthropic.APIError) throw new EngineError(`Claude 호출 실패 (${e.status}): ${e.message.slice(0, 200)}`);
    if (e instanceof Error && e.name === "TimeoutError") throw new EngineError("응답 시간 초과(150초).");
    throw new EngineError(e instanceof Error ? e.message.slice(0, 200) : "알 수 없는 오류");
  }
}
