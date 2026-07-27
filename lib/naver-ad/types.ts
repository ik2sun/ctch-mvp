// 네이버 검색광고 API 원본 응답 타입 (필요한 필드만 선언, 나머지는 통과시킴)

export type NaverCampaign = {
  nccCampaignId: string;
  customerId: number;
  name: string;
  campaignTp: string;
  status: string;
  statusReason: string;
  dailyBudget: number;
  useDailyBudget: boolean;
  expectCost: number;
  delFlag: boolean;
  regTm: string;
  editTm: string;
};

export type NaverAdGroup = {
  nccAdgroupId: string;
  nccCampaignId: string;
  customerId: number;
  name: string;
  status: string;
  statusReason: string;
  bidAmt: number;
  dailyBudget: number;
  useDailyBudget: boolean;
  delFlag: boolean;
  regTm: string;
  editTm: string;
};

export type NaverAd = {
  nccAdId: string;
  nccAdgroupId: string;
  customerId: number;
  type: string;
  status: string;
  inspectStatus: string;
  ad: Record<string, unknown>;
  delFlag?: boolean;
};

// GET /stats 응답의 entity별 요약 지표 (SummaryStatMap)
export type NaverStatRaw = {
  id: string;
  impCnt?: number;
  clkCnt?: number;
  ctr?: number;
  cpc?: number;
  salesAmt?: number; // 비용(VAT 포함) — "매출"이 아니라 광고비 지출액
  ccnt?: number; // 전환수(일반)
  purchaseCcnt?: number; // 구매 전환수 (전환추적 '구매' 이벤트 설정 시에만 값 존재)
  purchaseConvAmt?: number; // 구매 전환매출액 (동일 조건)
};

// 우리 대시보드에서 쓰는 정규화된 지표 — MetaRow와 동일한 지표 세트로 맞춰
// 메타/네이버 데이터를 같은 컴포넌트(TreeTable 등)로 렌더링할 수 있게 한다.
export type NaverMetrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
};

export function naverStatToMetrics(s: NaverStatRaw | undefined): NaverMetrics {
  return {
    impressions: s?.impCnt ?? 0,
    clicks: s?.clkCnt ?? 0,
    cost: s?.salesAmt ?? 0,
    conversions: s?.ccnt ?? 0,
    revenue: s?.purchaseConvAmt ?? 0,
  };
}

export const EMPTY_METRICS: NaverMetrics = {
  impressions: 0,
  clicks: 0,
  cost: 0,
  conversions: 0,
  revenue: 0,
};

// 요구 지표 전체(노출수/클릭수/CTR/CPC/비용/전환수/전환매출/ROAS/CPA)를 계산해 반환.
// CTR/CPC는 네이버가 이미 계산해 주면 그 값을 쓰고, 없으면 impCnt/clkCnt로부터 직접 계산한다.
export function deriveNaverMetrics(s: NaverStatRaw | undefined, id?: string) {
  const impressions = s?.impCnt ?? 0;
  const clicks = s?.clkCnt ?? 0;
  const cost = s?.salesAmt ?? 0;
  const conversions = s?.ccnt ?? 0;
  const revenue = s?.purchaseConvAmt ?? 0;

  return {
    id: id ?? s?.id,
    impressions,
    clicks,
    ctr: s?.ctr ?? (impressions ? (clicks / impressions) * 100 : 0),
    cpc: s?.cpc ?? (clicks ? cost / clicks : 0),
    cost,
    conversions,
    revenue,
    roas: cost ? (revenue / cost) * 100 : 0,
    cpa: conversions ? cost / conversions : 0,
  };
}
