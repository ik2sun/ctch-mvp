// 카카오모먼트 Open API 응답 타입 (필요한 필드만 선언, 나머지는 통과)

export type KakaoAdAccount = {
  id: number;
  name: string;
  status?: string;
  memberType?: string; // MASTER / MEMBER 등
  type?: string;
};

export type KakaoCampaign = {
  id: number;
  name: string;
  config?: string; // ON | OFF | DEL
  userConfig?: string;
  systemConfig?: string;
  status?: string | string[];
  campaignTypeGoal?: { campaignType?: string; goal?: string };
  dailyBudgetAmount?: number;
};

export type KakaoAdGroup = {
  id: number;
  name: string;
  campaignId: number;
  config?: string;
  status?: string | string[];
  dailyBudgetAmount?: number;
};

export type KakaoCreative = {
  id: number;
  name?: string;
  adGroupId: number;
  format?: string;
  config?: string;
  status?: string | string[];
  title?: string;
  description?: string;
};

// 목록 API는 { content: [...] } 또는 배열로 온다
export type KakaoPage<T> = { content?: T[]; totalElements?: number; totalPages?: number } | T[];

// 보고서 응답: data[] 각 행에 dimensions(집계 축)와 metrics(지표)
export type KakaoReportRow = {
  dimensions?: Record<string, string | number | null | undefined>;
  metrics?: Record<string, number | string | null | undefined>;
};
export type KakaoReportResponse = { code?: number; message?: string; data?: KakaoReportRow[] };

// 대시보드/리포트가 공유하는 정규화 지표 (메타·네이버와 동일 세트)
export type KakaoMetrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  reach: number;
};

// 전환 지표 기준 — 픽셀&SDK 전환 그룹의 '구매' 지표를 쓴다.
// 기여 기간은 7일을 기본으로, 없으면 1일 값을 쓴다. 지표 키는 카카오 보고서 metrics 키 그대로다.
//   conv_purchase_{1d|7d}   : 구매 전환수
//   conv_purchase_p_{1d|7d} : 구매 전환 금액 ("p" = price) — 가정. 실제 값이 비율(%)로 보이면 여기서 키만 바꾼다.
export const KAKAO_ATTRIBUTION_WINDOW: "1d" | "7d" = "7d";

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function pickWindow(m: Record<string, unknown>, base: string): number {
  const primary = m[`${base}_${KAKAO_ATTRIBUTION_WINDOW}`];
  if (primary != null) return num(primary);
  const fallback = KAKAO_ATTRIBUTION_WINDOW === "7d" ? m[`${base}_1d`] : m[`${base}_7d`];
  if (fallback != null) return num(fallback);
  return num(m[base]);
}

export function kakaoMetricsOf(row: KakaoReportRow | undefined): KakaoMetrics {
  const m = (row?.metrics ?? {}) as Record<string, unknown>;
  return {
    impressions: num(m.imp),
    clicks: num(m.click),
    cost: num(m.cost),
    conversions: pickWindow(m, "conv_purchase"),
    revenue: pickWindow(m, "conv_purchase_p"),
    reach: num(m.reach),
  };
}

export const EMPTY_KAKAO_METRICS: KakaoMetrics = { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, reach: 0 };

export function addMetrics(a: KakaoMetrics, b: KakaoMetrics): KakaoMetrics {
  return {
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    cost: a.cost + b.cost,
    conversions: a.conversions + b.conversions,
    revenue: a.revenue + b.revenue,
    reach: a.reach + b.reach,
  };
}
