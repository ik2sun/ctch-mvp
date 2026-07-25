// AI 마케팅 에이전트 > 제안서 위저드 전체에서 공유하는 타입

export const INDUSTRIES = ["이커머스", "패션", "식품", "금융", "게임", "기타"] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const PROPOSAL_GOALS = ["신규수주", "연장", "추가제안"] as const;
export type ProposalGoal = (typeof PROPOSAL_GOALS)[number];

export const KPI_OPTIONS = ["ROAS", "CPA", "브랜드인지도", "전환수"] as const;
export type Kpi = (typeof KPI_OPTIONS)[number];

export type BasicInfo = {
  clientId: string | null; // clients 테이블에서 선택한 경우
  clientName: string; // 선택/직접입력 결과 최종 광고주명
  industry: Industry;
  goal: ProposalGoal;
  kpi: Kpi;
  monthlyBudget: string; // 원 단위 문자열 입력 그대로 보관
  competitorUrls: string[]; // 최대 3개
};

export type Insight = {
  id: string;
  title: string;
  summary: string;
  source: "competitor" | "trend";
  sourceLabel: string; // 카드에 표시할 출처(예: 경쟁사 URL, "업종 트렌드")
};

export type SupportedFileKind = "pdf" | "image" | "excel" | "word";

export type FileAnalysis = {
  id: string;
  fileName: string;
  kind: SupportedFileKind;
  summary: string;
  keyPoints: string[];
};

export type SlideLayout =
  | "cover"
  | "data"
  | "strategy"
  | "timeline"
  | "impact"
  | "profile";

export type Slide = {
  index: number;
  title: string;
  subtitle: string;
  content: string;
  data: Record<string, unknown>;
  layout: SlideLayout;
  notes: string;
};

export const THEME_IDS = ["premium", "minimal", "bold"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export type BrandColors = {
  background: string;
  accent: string;
} | null;

export type ProposalRecord = {
  id: string;
  clientName: string;
  industry: string | null;
  theme: ThemeId;
  brandColors: BrandColors;
  slides: Slide[];
  shareToken: string;
  createdAt: string;
};
