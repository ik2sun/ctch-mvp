import type { CrawlerRole, Engine } from "./types";

// AI 검색·검색엔진 크롤러 User-Agent 표.
// "검색용(search)" UA 차단은 인용 불가로 직결되고, "학습용(training)" UA 차단은 인용과 무관하다.
// 두 종류를 절대 한 줄로 합쳐 판정하지 않는다. (ai-engine-citation-logic · seo-geo 스킬 기준)
export type CrawlerDef = {
  ua: string;
  owner: string;
  role: CrawlerRole;
  governs: string;
  engines: Engine[];
};

export const CRAWLERS: CrawlerDef[] = [
  { ua: "OAI-SearchBot", owner: "OpenAI", role: "search", governs: "ChatGPT 검색 인덱싱 · 인용 가능 여부", engines: ["ChatGPT"] },
  { ua: "ChatGPT-User", owner: "OpenAI", role: "fetch", governs: "ChatGPT 사용자 질의 시 실시간 페이지 fetch", engines: ["ChatGPT"] },
  { ua: "GPTBot", owner: "OpenAI", role: "training", governs: "OpenAI 모델 학습 수집 (인용과 무관)", engines: ["ChatGPT"] },
  { ua: "Googlebot", owner: "Google", role: "search", governs: "Google 검색 인덱스 = AI Overviews · AI Mode · Gemini grounding 원천", engines: ["Gemini·AIO"] },
  { ua: "Google-Extended", owner: "Google", role: "training", governs: "Gemini 학습·grounding 옵트아웃 (AI Overviews에는 영향 없음)", engines: ["Gemini·AIO"] },
  { ua: "Claude-SearchBot", owner: "Anthropic", role: "search", governs: "Claude 검색 결과 인덱싱 · 인용 가능 여부", engines: ["Claude"] },
  { ua: "Claude-User", owner: "Anthropic", role: "fetch", governs: "Claude 사용자 요청 시 실시간 fetch", engines: ["Claude"] },
  { ua: "ClaudeBot", owner: "Anthropic", role: "training", governs: "Anthropic 모델 학습 수집 (인용과 무관)", engines: ["Claude"] },
  { ua: "PerplexityBot", owner: "Perplexity", role: "search", governs: "Perplexity 자체 인덱스 구축 · 인용 가능 여부", engines: ["Perplexity"] },
  { ua: "Perplexity-User", owner: "Perplexity", role: "fetch", governs: "Perplexity 사용자 질의 시 실시간 fetch", engines: ["Perplexity"] },
  { ua: "bingbot", owner: "Microsoft", role: "search", governs: "Bing 인덱스 = Copilot 원천", engines: ["Copilot"] },
  { ua: "Yeti", owner: "네이버", role: "search", governs: "네이버 검색 색인 = AI 브리핑 · AI 탭 원천", engines: ["네이버"] },
  { ua: "CCBot", owner: "Common Crawl", role: "training", governs: "다수 모델 학습 데이터 (인용과 무관)", engines: [] },
];

export const SEARCH_CRAWLERS = CRAWLERS.filter((c) => c.role === "search");
