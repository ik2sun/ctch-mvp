// 네이버 검색광고 키워드 견적 — 서버 전용. 형식은 공식 샘플(github.com/naver/searchad-apidoc java-sample model/estimate) 기준.
//   POST /estimate/average-position-bid/keyword {device, items:[{key, position}]} → estimate[{keyword, position, bid}]
//   POST /estimate/exposure-minimum-bid/keyword · /estimate/median-bid/keyword {device, period, items:[키워드]} → estimate[{keyword, bid}]
//   POST /estimate/performance/keyword {device, keywordplus, key, bids[≤100]} → estimate(샘플 필드명은 'estiamte' 오타 — 둘 다 읽음)[{bid, impressions, clicks, cost}]
//   POST /estimate/performance-bulk {items:[{keyword, bid, device, keywordplus}] ≤200}
//   GET  /keywordstool?hintKeywords=a,b(≤5, 공백 제거)&showDetail=1 → keywordList[{relKeyword, monthlyPcQcCnt, …}] (10 미만은 "< 10" 문자열)
// 견적은 키워드 시장 단위라 광고주 계정과 무관 — 광고주 고객 ID가 없으면 공용 키의 발급(대행사) 계정으로 조회한다.
// 성과 견적(노출·클릭·비용)은 네이버 키워드 도구 '예상 실적'과 같은 월간 값으로 본다(가정 — 관리자 화면과 대조할 것).
import { naverAdRequest, chunk } from "./client";
import { resolveNaverAdCredentials, NaverAdNotConfiguredError, type NaverAdCredentials, type NaverAdCredentialRow } from "./auth";
import { getSharedNaverKey } from "./sharedKey";
import { createAdminClient } from "@/lib/supabase/admin";

export type NaverDevice = "PC" | "MOBILE";
export const NAVER_POSITIONS = [1, 2, 3, 4, 5] as const;
export const NAVER_MIN_BID = 70;
export const NAVER_MAX_BID = 100000;

// 순서: 선택 광고주의 고객 ID → 공용 키 발급 계정 → 고객 ID가 등록된 다른 광고주(공용 키로)
export async function resolveEstimateCredentials(row: NaverAdCredentialRow): Promise<NaverAdCredentials> {
  if (row?.naver_ad_customer_id?.trim()) return resolveNaverAdCredentials(row);
  const shared = await getSharedNaverKey();
  if (!shared) throw new NaverAdNotConfiguredError("네이버 공용 API 키가 없어요. API 공용 키 관리 > 네이버에서 등록해 주세요.");
  let customerId = shared.ownerCustomerId;
  if (!customerId) {
    const { data } = await createAdminClient()
      .from("clients")
      .select("naver_ad_customer_id")
      .not("naver_ad_customer_id", "is", null)
      .is("naver_ad_api_key", null) // 개별 키 광고주는 공용 키 권한이 없을 수 있어 제외
      .limit(1);
    customerId = data?.[0]?.naver_ad_customer_id?.trim() || null;
  }
  if (!customerId) {
    throw new NaverAdNotConfiguredError("견적을 조회할 네이버 계정이 없어요. 광고주에 네이버 SA 고객 ID를 넣거나, API 공용 키 관리 > 네이버에 '키를 발급한 대행사 계정 번호'를 넣어 주세요.");
  }
  return { apiKey: shared.apiKey, secretKey: shared.secretKey, customerId };
}

// 네이버는 키워드의 공백을 무시한다(키워드 도구·견적 응답 모두 붙여 쓴 형태로 비교)
export const normKeyword = (k: string) => k.replace(/\s+/g, "").toUpperCase();
// 견적 API에는 반드시 붙여 써서 보낸다 — 띄어쓰기가 있으면 데이터 없음(전 순위 70원·실적 0)으로 온다(2026-10-04 실측: '여성 스니커즈' 70원 vs '여성스니커즈' 1위 950원)
const sendKey = (k: string) => k.replace(/\s+/g, "");

export function roundBid(v: number): number {
  return Math.min(NAVER_MAX_BID, Math.max(NAVER_MIN_BID, Math.round(v / 10) * 10));
}

// ---------- 키워드 도구(검색량·경쟁) ----------

export type NaverKeywordStat = {
  keyword: string;
  pcSearch: number;
  mobileSearch: number;
  lowVolume: boolean; // "< 10"이 섞여 있음
  pcClicks: number;
  mobileClicks: number;
  pcCtr: number;
  mobileCtr: number;
  avgDepth: number; // 월평균 노출 광고 수
  competition: string; // 높음·중간·낮음
};

type RawStat = Record<string, string | number | undefined>;
const num = (v: string | number | undefined) => (typeof v === "number" ? v : v && /</.test(v) ? 5 : Number(v) || 0);
const isLow = (v: string | number | undefined) => typeof v === "string" && /</.test(v);

function toStat(r: RawStat): NaverKeywordStat {
  return {
    keyword: String(r.relKeyword ?? ""),
    pcSearch: num(r.monthlyPcQcCnt),
    mobileSearch: num(r.monthlyMobileQcCnt),
    lowVolume: isLow(r.monthlyPcQcCnt) || isLow(r.monthlyMobileQcCnt),
    pcClicks: num(r.monthlyAvePcClkCnt),
    mobileClicks: num(r.monthlyAveMobileClkCnt),
    pcCtr: num(r.monthlyAvePcCtr),
    mobileCtr: num(r.monthlyAveMobileCtr),
    avgDepth: num(r.plAvgDepth),
    competition: String(r.compIdx ?? ""),
  };
}

// 입력 키워드의 통계 + 연관 키워드(검색량 순). 5개씩 묶어 호출.
export async function fetchKeywordStats(c: NaverAdCredentials, keywords: string[]): Promise<{ stats: Map<string, NaverKeywordStat>; related: NaverKeywordStat[] }> {
  const stats = new Map<string, NaverKeywordStat>();
  const related = new Map<string, NaverKeywordStat>();
  const wanted = new Set(keywords.map(normKeyword));
  for (const group of chunk(keywords, 5)) {
    const res = await naverAdRequest<{ keywordList?: RawStat[] }>("GET", "/keywordstool", c, {
      hintKeywords: group.map((k) => k.replace(/\s+/g, "")).join(","),
      showDetail: 1,
    });
    for (const r of res.keywordList ?? []) {
      const s = toStat(r);
      const key = normKeyword(s.keyword);
      if (wanted.has(key)) stats.set(key, s);
      else if (!related.has(key)) related.set(key, s);
    }
  }
  const rel = [...related.values()].sort((a, b) => b.pcSearch + b.mobileSearch - (a.pcSearch + a.mobileSearch)).slice(0, 30);
  return { stats, related: rel };
}

// ---------- 입찰가 견적 ----------

type BidRow = { keyword?: string; position?: number; bid?: number };

// 키워드별 순위(1~5위) 평균 입찰가
export async function fetchPositionBids(c: NaverAdCredentials, device: NaverDevice, keywords: string[]): Promise<Map<string, Record<number, number>>> {
  const out = new Map<string, Record<number, number>>();
  const items = keywords.flatMap((key) => NAVER_POSITIONS.map((position) => ({ key: sendKey(key), position })));
  for (const part of chunk(items, 100)) {
    const res = await naverAdRequest<{ estimate?: BidRow[] }>("POST", "/estimate/average-position-bid/keyword", c, undefined, { device, items: part });
    for (const e of res.estimate ?? []) {
      if (!e.keyword || !e.position) continue;
      const k = normKeyword(e.keyword);
      out.set(k, { ...(out.get(k) ?? {}), [e.position]: Number(e.bid) || 0 });
    }
  }
  return out;
}

// 최소 노출 입찰가 / 중간 입찰가(최근 한 달)
export async function fetchDistributionBids(c: NaverAdCredentials, device: NaverDevice, kind: "exposure-minimum-bid" | "median-bid", keywords: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const part of chunk(keywords, 100)) {
    const res = await naverAdRequest<{ estimate?: BidRow[] }>("POST", `/estimate/${kind}/keyword`, c, undefined, { device, period: "MONTH", items: part.map(sendKey) });
    for (const e of res.estimate ?? []) if (e.keyword) out.set(normKeyword(e.keyword), Number(e.bid) || 0);
  }
  return out;
}

// ---------- 성과 견적 ----------

export type NaverPerf = { bid: number; impressions: number; clicks: number; cost: number };
type PerfRow = { bid?: number; impressions?: number; clicks?: number; cost?: number };

const perfOf = (r: PerfRow): NaverPerf => ({ bid: Number(r.bid) || 0, impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0, cost: Number(r.cost) || 0 });

// 한 키워드 × 여러 입찰가(최대 100) — 입찰가 곡선
export async function fetchPerformanceLadder(c: NaverAdCredentials, device: NaverDevice, keyword: string, bids: number[]): Promise<NaverPerf[]> {
  const res = await naverAdRequest<{ estimate?: PerfRow[]; estiamte?: PerfRow[] }>("POST", "/estimate/performance/keyword", c, undefined, {
    device,
    keywordplus: false,
    key: sendKey(keyword),
    bids: bids.slice(0, 100),
  });
  return (res.estimate ?? res.estiamte ?? []).map(perfOf).sort((a, b) => a.bid - b.bid);
}

// 여러 키워드 × 각자 입찰가(최대 200) — 운영안 합계
export async function fetchPerformanceBulk(c: NaverAdCredentials, device: NaverDevice, items: { keyword: string; bid: number }[]): Promise<Map<string, NaverPerf>> {
  const out = new Map<string, NaverPerf>();
  for (const part of chunk(items, 200)) {
    const res = await naverAdRequest<(PerfRow & { keyword?: string })[] | { items?: (PerfRow & { keyword?: string })[] }>("POST", "/estimate/performance-bulk", c, undefined, {
      items: part.map((i) => ({ keyword: sendKey(i.keyword), bid: i.bid, device, keywordplus: false })),
    });
    const rows = Array.isArray(res) ? res : (res.items ?? []);
    for (const r of rows) if (r.keyword) out.set(normKeyword(r.keyword), perfOf(r));
  }
  return out;
}

// 곡선용 입찰가 — lo ~ max(1위가·최소 노출가)×1.5 사이 로그 간격(10원 단위, 중복 제거, 최대 41점)
export function ladderBids(lo0: number, topBid: number): number[] {
  const lo = roundBid(Math.max(NAVER_MIN_BID, lo0 || NAVER_MIN_BID));
  const hi = roundBid(Math.max(lo * 10, (topBid || lo * 10) * 1.5));
  const steps = 40;
  const set = new Set<number>();
  for (let i = 0; i <= steps; i++) set.add(roundBid(lo * Math.pow(hi / lo, i / steps))); // 로그 간격 — 낮은 입찰가 구간을 더 촘촘히
  return [...set].sort((a, b) => a - b);
}
