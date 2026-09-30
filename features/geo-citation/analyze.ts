// GEO 인용 추적 — 판정·집계 (순수 함수, 화면·서버 공용)
// 원칙: 엔진별로 분리해 집계하고 네이버는 글로벌 엔진과 합산하지 않는다.
import { API_ENGINES, isMentioned, type GeoAnswer, type GeoCitation, type GeoEngine, type GeoSettings } from "./types";

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "";
  }
}

// "https://www.brand.com/path" · "brand.com" 모두 받아 호스트로 정규화
export function normalizeDomain(input: string): string {
  const s = input.trim().toLowerCase();
  if (!s) return "";
  return hostOf(/^https?:\/\//.test(s) ? s : `https://${s}`);
}

export function isOwnDomain(domain: string, ownDomains: string[]): boolean {
  const d = domain.toLowerCase();
  return ownDomains.some((o) => o && (d === o || d.endsWith(`.${o}`)));
}

// 인용 목록에 자사 여부를 붙이고 같은 URL은 첫 순위만 남긴다
export function finalizeCitations(list: { url: string; title?: string; domain?: string }[], ownDomains: string[]): GeoCitation[] {
  const seen = new Set<string>();
  const out: GeoCitation[] = [];
  for (const c of list) {
    const key = c.url.replace(/[#?].*$/, "").replace(/\/$/, "");
    if (!c.url || seen.has(key)) continue;
    seen.add(key);
    const domain = c.domain || hostOf(c.url);
    out.push({ rank: out.length + 1, url: c.url, title: (c.title ?? "").slice(0, 300), domain, own: isOwnDomain(domain, ownDomains) });
  }
  return out;
}

function firstIndex(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  let best = -1;
  for (const t of terms) {
    const term = t.trim().toLowerCase();
    if (term.length < 2) continue;
    const i = lower.indexOf(term);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

// 언급 판정: 브랜드 표기 문자열 매칭. 제품명 단독 등장·환각 제품명은 놓치거나 잘못 잡힐 수 있어
// 화면에서 원문 대조 후 mention_override로 보정한다.
export function detectMentions(answer: string, settings: Pick<GeoSettings, "brand_terms" | "competitors" | "own_domains">) {
  const ownTerms = [...settings.brand_terms, ...settings.own_domains.map((d) => d.split(".")[0])].filter((t) => t.length >= 2);
  const ownAt = firstIndex(answer, ownTerms);
  const hits = settings.competitors
    .map((c) => ({ name: c, at: firstIndex(answer, c.split("/").map((x) => x.trim())) }))
    .filter((h) => h.at >= 0);
  const mentioned = ownAt >= 0;
  const mentionOrder = mentioned ? hits.filter((h) => h.at < ownAt).length + 1 : null;
  return { mentioned, mentionOrder, competitorsMentioned: hits.map((h) => h.name) };
}

// ---------------------------------------------------------------- 출처 유형
export const SOURCE_TYPES = ["자사", "이커머스", "커뮤니티", "블로그", "영상", "미디어", "위키·사전", "공공·학술", "기타"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

const TYPE_PATTERNS: [SourceType, RegExp][] = [
  ["영상", /(youtube\.com|youtu\.be|tiktok\.com|tv\.naver\.com|vimeo\.com)$/],
  ["블로그", /(blog\.naver\.com|tistory\.com|brunch\.co\.kr|medium\.com|velog\.io|wordpress\.com|blogspot\.com|substack\.com)$|^blog\./],
  ["커뮤니티", /(reddit\.com|cafe\.naver\.com|kin\.naver\.com|quora\.com|dcinside\.com|theqoo\.net|clien\.net|ppomppu\.co\.kr|fmkorea\.com|instiz\.net|stackoverflow\.com|x\.com|twitter\.com|instagram\.com|facebook\.com|threads\.net)$/],
  ["이커머스", /(coupang\.com|smartstore\.naver\.com|shopping\.naver\.com|oliveyoung\.co\.kr|11st\.co\.kr|gmarket\.co\.kr|auction\.co\.kr|ssg\.com|musinsa\.com|kurly\.com|amazon\.[a-z.]+|lotteon\.com|29cm\.co\.kr|wconcept\.co\.kr|hwahae\.co\.kr|glowpick\.com)$/],
  ["위키·사전", /(wikipedia\.org|namu\.wiki|terms\.naver\.com|dict\.naver\.com|britannica\.com)$/],
  ["공공·학술", /(\.go\.kr|\.gov|\.ac\.kr|\.edu|\.or\.kr|ncbi\.nlm\.nih\.gov|pubmed|scholar\.google|dbpia\.co\.kr|kci\.go\.kr|who\.int|sciencedirect\.com|nature\.com)$/],
  ["미디어", /(news\.|\.news$|chosun\.com|joongang\.co\.kr|donga\.com|hani\.co\.kr|khan\.co\.kr|mk\.co\.kr|hankyung\.com|yna\.co\.kr|sedaily\.com|edaily\.co\.kr|mt\.co\.kr|newsis\.com|news1\.kr|zdnet\.co\.kr|etnews\.com|bloter\.net|forbes\.com|nytimes\.com|cnn\.com|bbc\.co\.uk|reuters\.com|allure\.com|vogue\.)/],
];

export function sourceTypeOf(c: Pick<GeoCitation, "domain" | "own">): SourceType {
  if (c.own) return "자사";
  for (const [type, re] of TYPE_PATTERNS) if (re.test(c.domain)) return type;
  return "기타";
}

// ---------------------------------------------------------------- 집계
export type EngineStats = {
  engine: GeoEngine;
  answered: number;
  errors: number;
  mentioned: number;
  firstMention: number; // 추적 브랜드 중 자사가 가장 먼저 등장
  ownCited: number;
  avgOwnCiteRank: number | null;
  citationTotal: number;
  ownCitationShare: number | null; // 전체 인용 URL 중 자사 비중
  noCitations: number; // 인용을 하나도 내지 않은 응답 수
};

const pct = (n: number, d: number) => (d > 0 ? n / d : null);

export function engineStats(answers: GeoAnswer[], engine: GeoEngine): EngineStats {
  const rows = answers.filter((a) => a.engine === engine);
  const done = rows.filter((a) => a.status === "done");
  const ownRanks = done.map((a) => a.own_cite_rank).filter((r): r is number => typeof r === "number");
  const citationTotal = done.reduce((s, a) => s + a.citations.length, 0);
  const ownCitations = done.reduce((s, a) => s + a.citations.filter((c) => c.own).length, 0);
  return {
    engine,
    answered: done.length,
    errors: rows.filter((a) => a.status === "error").length,
    mentioned: done.filter(isMentioned).length,
    firstMention: done.filter((a) => isMentioned(a) && a.mention_order === 1).length,
    ownCited: done.filter((a) => a.own_cited).length,
    avgOwnCiteRank: ownRanks.length ? ownRanks.reduce((s, r) => s + r, 0) / ownRanks.length : null,
    citationTotal,
    ownCitationShare: pct(ownCitations, citationTotal),
    noCitations: done.filter((a) => a.citations.length === 0).length,
  };
}

// 글로벌 엔진(API 측정분) 합계 — 네이버 제외
export function globalStats(answers: GeoAnswer[]) {
  const done = answers.filter((a) => a.status === "done" && a.engine !== "naver");
  const citations = done.flatMap((a) => a.citations);
  return {
    answered: done.length,
    mentionRate: pct(done.filter(isMentioned).length, done.length),
    ownCiteRate: pct(done.filter((a) => a.own_cited).length, done.length),
    ownCitationShare: pct(citations.filter((c) => c.own).length, citations.length),
    citationTotal: citations.length,
  };
}

export type DomainRow = { domain: string; type: SourceType; count: number; answers: number; engines: Partial<Record<GeoEngine, number>>; own: boolean };

export function topDomains(answers: GeoAnswer[], limit = 20): DomainRow[] {
  const map = new Map<string, DomainRow>();
  for (const a of answers) {
    if (a.status !== "done") continue;
    const seenInAnswer = new Set<string>();
    for (const c of a.citations) {
      const row = map.get(c.domain) ?? { domain: c.domain, type: sourceTypeOf(c), count: 0, answers: 0, engines: {}, own: c.own };
      row.count += 1;
      row.engines[a.engine] = (row.engines[a.engine] ?? 0) + 1;
      if (!seenInAnswer.has(c.domain)) {
        row.answers += 1;
        seenInAnswer.add(c.domain);
      }
      map.set(c.domain, row);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function typeDistribution(answers: GeoAnswer[]): { type: SourceType; count: number }[] {
  const counts = new Map<SourceType, number>();
  for (const a of answers) {
    if (a.status !== "done" || a.engine === "naver") continue;
    for (const c of a.citations) counts.set(sourceTypeOf(c), (counts.get(sourceTypeOf(c)) ?? 0) + 1);
  }
  return SOURCE_TYPES.map((type) => ({ type, count: counts.get(type) ?? 0 })).filter((r) => r.count > 0);
}

export function competitorCoMentions(answers: GeoAnswer[], competitors: string[]) {
  const done = answers.filter((a) => a.status === "done");
  return competitors
    .map((name) => {
      const withComp = done.filter((a) => a.competitors_mentioned.includes(name));
      return {
        name,
        mentioned: withComp.length,
        together: withComp.filter(isMentioned).length,
        aloneWithoutUs: withComp.filter((a) => !isMentioned(a)).length,
      };
    })
    .sort((a, b) => b.mentioned - a.mentioned);
}

// 어느 글로벌 엔진에서도 언급되지 않은 질문과 그 자리를 차지한 경쟁사
export function unmentionedQueries(answers: GeoAnswer[]) {
  const byQuery = new Map<string, GeoAnswer[]>();
  for (const a of answers) {
    if (a.status !== "done" || a.engine === "naver") continue;
    byQuery.set(a.query, [...(byQuery.get(a.query) ?? []), a]);
  }
  return [...byQuery.entries()]
    .filter(([, rows]) => rows.length > 0 && rows.every((r) => !isMentioned(r)))
    .map(([query, rows]) => ({
      query,
      stage: rows[0].stage,
      competitors: [...new Set(rows.flatMap((r) => r.competitors_mentioned))],
      topDomains: [...new Set(rows.flatMap((r) => r.citations.slice(0, 3).map((c) => c.domain)))].slice(0, 5),
    }));
}

export { API_ENGINES };
