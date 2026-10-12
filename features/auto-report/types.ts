// 자동 리포트 — 타입·지표 목록(순수). 광고주별 리포트 양식(ReportSpec)은 업로드한 예시 리포트를 AI가 학습해 만들고, 화면에서 고칠 수 있다.

export const METRICS = {
  cost: { label: "광고비", unit: "won" },
  impressions: { label: "노출", unit: "count" },
  clicks: { label: "클릭", unit: "count" },
  ctr: { label: "CTR", unit: "pct" },
  cpc: { label: "CPC", unit: "won" },
  cpm: { label: "CPM", unit: "won" },
  conversions: { label: "전환", unit: "count1" },
  cvr: { label: "전환율", unit: "pct" },
  cpa: { label: "CPA", unit: "won" },
  revenue: { label: "매출", unit: "won" },
  roas: { label: "ROAS", unit: "pct0" },
} as const;
export type MetricKey = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];
// 낮을수록 좋은 지표(증감 색)
export const LOWER_BETTER: MetricKey[] = ["cpc", "cpm", "cpa"];

export const SECTION_TYPES = {
  kpi: { label: "핵심 지표(KPI)", desc: "기간 합계와 비교 기간 대비 증감" },
  media_table: { label: "매체별 성과 표", desc: "연동 매체마다 한 줄" },
  campaign_table: { label: "캠페인별 성과 표", desc: "광고비 상위 N개 캠페인" },
  daily_table: { label: "일별 추이 표", desc: "기간 안 날짜마다 한 줄" },
  insights: { label: "AI 분석 코멘트", desc: "표의 수치만으로 쓴 요약·원인 후보·다음 액션" },
  text: { label: "고정 문구", desc: "인사말·안내 등 매번 같은 글(변수 {광고주} {기간} 사용 가능)" },
} as const;
export type SectionType = keyof typeof SECTION_TYPES;

export type ReportSection = {
  id: string;
  type: SectionType;
  title: string;
  metrics: MetricKey[]; // 표·KPI에 보여 줄 지표(순서대로)
  limit?: number; // 캠페인 표 줄 수
  sortBy?: MetricKey; // 캠페인 표 정렬(기본 광고비)
  showCompare?: boolean; // 비교 기간 대비 증감 표시
  note?: string; // insights: 무엇을 중심으로 쓸지 / text: 그대로 넣을 문구
};

export type ReportSpec = {
  subject: string; // 메일 제목 — {광고주} {기간} 치환
  intro?: string; // 본문 첫 문단(선택)
  tone: string; // 코멘트 말투·길이(예: "보고서체, 항목당 2~3문장")
  sections: ReportSection[];
  learnedFrom?: string; // AI가 원본에서 읽은 구조 요약
  unsupported?: string[]; // 원본에 있지만 자동으로 못 만드는 항목(예: GA4 유입, 경쟁사 동향)
};

export const PERIODS = {
  yesterday: "어제(하루)",
  last7: "최근 7일(어제까지)",
  last_week: "지난주(월~일)",
  this_month: "이번 달 1일~어제",
  last_month: "지난달 전체",
} as const;
export type PeriodKey = keyof typeof PERIODS;

export const COMPARES = { prev: "직전 같은 기간", week_ago: "1주 전 같은 기간", none: "비교 안 함" } as const;
export type CompareKey = keyof typeof COMPARES;

export const FREQUENCIES = { daily: "매일", weekly: "매주", monthly: "매월" } as const;
export type Frequency = keyof typeof FREQUENCIES;

export type Schedule = {
  period: PeriodKey;
  compare: CompareKey;
  frequency: Frequency;
  weekday: number; // 1=월 … 7=일 (weekly)
  monthDay: number; // 1~28 (monthly)
};

export type ReportOptions = {
  attachXlsx: boolean;
  media: string[]; // 포함할 매체 키(비면 연동된 전부)
};

export type AutoReport = {
  id?: string;
  clientId: string;
  name: string;
  enabled: boolean;
  spec: ReportSpec;
  source: { kind: "file" | "google" | "none"; name: string; excerpt?: string } | null;
  schedule: Schedule;
  recipients: string[];
  options: ReportOptions;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export type ReportRun = {
  id: string;
  reportId: string;
  trigger: "preview" | "manual" | "cron";
  status: "ok" | "sent" | "error";
  period: { since: string; until: string; compareSince?: string; compareUntil?: string } | null;
  subject: string | null;
  sentTo: string[] | null;
  error: string | null;
  createdBy: string | null;
  createdAt: string;
};

export const DEFAULT_SCHEDULE: Schedule = { period: "last_week", compare: "prev", frequency: "weekly", weekday: 1, monthDay: 1 };

export const DEFAULT_SPEC: ReportSpec = {
  subject: "[{광고주}] 광고 성과 리포트 ({기간})",
  intro: "안녕하세요. {광고주} {기간} 광고 성과를 공유드립니다.",
  tone: "보고서체, 항목당 2~3문장, 수치 근거를 함께",
  sections: [
    { id: "s1", type: "kpi", title: "핵심 지표", metrics: ["cost", "revenue", "roas", "conversions", "cpa"], showCompare: true },
    { id: "s2", type: "media_table", title: "매체별 성과", metrics: ["cost", "impressions", "clicks", "ctr", "conversions", "cpa", "revenue", "roas"], showCompare: true },
    { id: "s3", type: "campaign_table", title: "캠페인 성과(광고비 상위 10)", metrics: ["cost", "clicks", "conversions", "cpa", "roas"], limit: 10, sortBy: "cost" },
    { id: "s4", type: "insights", title: "분석 및 다음 액션", metrics: [], note: "증감이 큰 매체·캠페인 중심으로 원인 후보와 다음 주 액션" },
  ],
};

export const sectionId = () => `s${Math.random().toString(36).slice(2, 8)}`;
