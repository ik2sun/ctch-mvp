// 구글 키워드 플래너(KeywordPlanIdeaService) — 서버 전용. REST v25.
//   :generateKeywordIdeas  → 월평균 검색량·경쟁·상단 노출 입찰가(낮음~높음) + 연관 키워드
//   :generateKeywordForecastMetrics → 입찰가(수동 CPC)별 예상 노출·클릭·비용(예측 기간 합계, 여기선 다음 30일)
// 대상: 한국(geoTargetConstants/2410) · 한국어(languageConstants/1012) · 구글 검색(파트너 제외).
// 주의: Explorer 등급은 키워드 플래너가 막혀 있다(공식 access-levels 문서) → Basic 승인 전엔 PlannerLockedError로 안내.
import { gadsCall, GoogleAdsApiError } from "./client";
import type { GoogleAdsCredentials } from "./auth";

const GEO_KR = "geoTargetConstants/2410";
const LANG_KO = "languageConstants/1012";

export class PlannerLockedError extends Error {}

const norm = (k: string) => k.replace(/\s+/g, "").toLowerCase();

async function call<T>(creds: GoogleAdsCredentials, suffix: string, body: unknown): Promise<T> {
  try {
    return await gadsCall<T>(creds, suffix, body);
  } catch (e) {
    if (e instanceof GoogleAdsApiError && (e.code === "FORBIDDEN" || e.code === "NOT_APPROVED") && !/USER_PERMISSION_DENIED|CUSTOMER_NOT_ENABLED/.test(e.message)) {
      throw new PlannerLockedError(
        "구글 키워드 플래너는 API Basic 등급부터 쓸 수 있어요(지금 ctch 프로젝트는 Explorer — 성과 조회는 되지만 키워드 플래너는 막혀 있음). Cloud Console > Google Ads API에서 브랜드 인증 후 Basic을 신청하세요.",
      );
    }
    throw e;
  }
}

export type GoogleKeywordIdea = {
  keyword: string;
  monthlySearch: number;
  competition: string; // LOW·MEDIUM·HIGH → 낮음·중간·높음
  competitionIndex: number;
  lowBid: number; // 상단 노출 입찰가(하위 20%) 원
  highBid: number; // 상단 노출 입찰가(상위 80%) 원
};

const COMP: Record<string, string> = { LOW: "낮음", MEDIUM: "중간", HIGH: "높음" };

type RawIdea = {
  text?: string;
  keywordIdeaMetrics?: { avgMonthlySearches?: string; competition?: string; competitionIndex?: string; lowTopOfPageBidMicros?: string; highTopOfPageBidMicros?: string };
};

export async function fetchKeywordIdeas(creds: GoogleAdsCredentials, keywords: string[]): Promise<{ stats: Map<string, GoogleKeywordIdea>; related: GoogleKeywordIdea[] }> {
  const res = await call<{ results?: RawIdea[] }>(creds, ":generateKeywordIdeas", {
    language: LANG_KO,
    geoTargetConstants: [GEO_KR],
    keywordPlanNetwork: "GOOGLE_SEARCH",
    includeAdultKeywords: false,
    keywordSeed: { keywords: keywords.slice(0, 20) },
    pageSize: 200,
  });
  const wanted = new Set(keywords.map(norm));
  const stats = new Map<string, GoogleKeywordIdea>();
  const related: GoogleKeywordIdea[] = [];
  for (const r of res.results ?? []) {
    const m = r.keywordIdeaMetrics ?? {};
    const idea: GoogleKeywordIdea = {
      keyword: r.text ?? "",
      monthlySearch: Number(m.avgMonthlySearches) || 0,
      competition: COMP[m.competition ?? ""] ?? "—",
      competitionIndex: Number(m.competitionIndex) || 0,
      lowBid: Math.round((Number(m.lowTopOfPageBidMicros) || 0) / 1e6),
      highBid: Math.round((Number(m.highTopOfPageBidMicros) || 0) / 1e6),
    };
    const k = norm(idea.keyword);
    if (wanted.has(k) && !stats.has(k)) stats.set(k, idea);
    else if (!wanted.has(k)) related.push(idea);
  }
  related.sort((a, b) => b.monthlySearch - a.monthlySearch);
  return { stats, related: related.slice(0, 30) };
}

export type GoogleForecast = { bid: number; impressions: number; clicks: number; cost: number; conversions: number };

function period() {
  const d = new Date();
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const start = new Date(d.getTime() + 86400000);
  const end = new Date(start.getTime() + 29 * 86400000);
  return { startDate: iso(start), endDate: iso(end) };
}

type RawForecast = { campaignForecastMetrics?: { impressions?: number; clicks?: number; costMicros?: string; conversions?: number } };

// 키워드 묶음 × 각자 입찰가(원) → 다음 30일 캠페인 합계. matchType: 구분 일치(EXACT)가 기본 — 검색어와 정확히 같은 경우만
export async function fetchForecast(creds: GoogleAdsCredentials, items: { keyword: string; bid: number }[], matchType: "EXACT" | "PHRASE" | "BROAD" = "EXACT"): Promise<GoogleForecast> {
  const maxBid = Math.max(...items.map((i) => i.bid), 10);
  const res = await call<RawForecast>(creds, ":generateKeywordForecastMetrics", {
    forecastPeriod: period(),
    campaign: {
      languageConstants: [LANG_KO],
      geoModifiers: [{ geoTargetConstant: GEO_KR }],
      keywordPlanNetwork: "GOOGLE_SEARCH",
      biddingStrategy: { manualCpcBiddingStrategy: { maxCpcBidMicros: String(Math.round(maxBid * 1e6)) } },
      adGroups: [
        {
          biddableKeywords: items.map((i) => ({ keyword: { text: i.keyword, matchType }, maxCpcBidMicros: String(Math.round(i.bid * 1e6)) })),
        },
      ],
    },
  });
  const m = res.campaignForecastMetrics ?? {};
  return {
    bid: maxBid,
    impressions: Math.round(Number(m.impressions) || 0),
    clicks: Math.round(Number(m.clicks) || 0),
    cost: Math.round((Number(m.costMicros) || 0) / 1e6),
    conversions: Number(m.conversions) || 0,
  };
}

// 한 키워드의 입찰가 곡선 — 상단 노출가 범위 주변 8점(호출 8건)
export async function fetchForecastLadder(creds: GoogleAdsCredentials, keyword: string, lowBid: number, highBid: number, matchType: "EXACT" | "PHRASE" | "BROAD" = "EXACT"): Promise<GoogleForecast[]> {
  const lo = Math.max(10, Math.round((lowBid || 300) * 0.5));
  const hi = Math.max(lo * 3, Math.round((highBid || lo * 4) * 1.5));
  const bids = [...new Set(Array.from({ length: 8 }, (_, i) => Math.round((lo * Math.pow(hi / lo, i / 7)) / 10) * 10))];
  const out: GoogleForecast[] = [];
  for (const bid of bids) out.push({ ...(await fetchForecast(creds, [{ keyword, bid }], matchType)), bid });
  return out;
}
