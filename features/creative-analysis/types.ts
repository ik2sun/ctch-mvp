// 소재 분석 공용 타입 — API 응답과 화면이 함께 쓴다
import type { DailyPoint } from "@/features/ai-report/metaTypes";

export type ObjectiveGroup = "sales" | "upper"; // 전환(판매) / 인지·트래픽·참여 등

export type CreativeMetrics = {
  impressions: number;
  reach: number;
  frequency: number;
  linkClicks: number;
  cost: number;
  conversions: number;
  revenue: number;
  videoViews3s: number; // 3초 이상 재생
  thruplays: number;
};

export type CreativeRow = CreativeMetrics & {
  id: string;
  name: string;
  status: string;
  createdTime: string | null;
  adsetId: string;
  adsetName: string;
  campaignId: string;
  campaignName: string;
  format: "video" | "image" | "dynamic" | "carousel" | "other";
  thumbnailUrl: string | null;
  thumbnailRatio: string | null; // 원본에 가까운 비율(1.91:1·1:1·4:5·9:16)
  title: string | null;
  body: string | null;
  cta: string | null;
  previewUrl: string | null;
  daily?: DailyPoint[]; // 광고비 상위 소재만
};

export type AdsetSetting = {
  id: string;
  name: string;
  campaignId: string;
  status: string;
  optimizationGoal: string | null;
  bidStrategy: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  learning: string | null; // LEARNING / SUCCESS / FAIL
  ageMin: number | null;
  ageMax: number | null;
  genders: number[]; // 1=남, 2=여, 빈 배열=전체
  countries: string[];
  customIncluded: string[];
  customExcluded: string[];
  interests: string[];
  advantageAudience: boolean;
  placements: "auto" | "manual";
  platforms: string[];
};

export type CampaignSetting = {
  id: string;
  name: string;
  objective: string | null;
  group: ObjectiveGroup;
  bidStrategy: string | null;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  advantagePlus: boolean;
};

export type CreativeAnalysisRes = {
  clientName: string;
  period: { since: string; until: string };
  creatives: CreativeRow[];
  adsets: AdsetSetting[];
  campaigns: CampaignSetting[];
  notes: string[];
};

export type CreativeAsset = { kind: "image" | "video"; url: string; width: number | null; height: number | null; lengthSec?: number | null };
