// 상관관계 분석 — 화면·API 공용 타입과 캠페인 역할 분류 규칙

export type CorrDaily = {
  date: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenue: number;
  videoViews?: number;
};

export type CorrCampaign = {
  id: string; // `${media}:${원본 id}`
  media: string;
  name: string;
  objective: string | null; // 매체 원본 값(메타 objective, GFA objective, 카카오 type/goal, 네이버 campaignTp)
  daily: CorrDaily[]; // 집행한 날만(빈 날은 화면에서 0으로 채움)
};

export type CorrMediaStatus = { key: string; label: string; ok: boolean; campaigns: number; note?: string; error?: string };

export type CorrDataRes = { since: string; until: string; media: CorrMediaStatus[]; campaigns: CorrCampaign[] };

// ── 역할 ─────────────────────────────────────────────
// 원인(상위 퍼널) 4종은 차트에서 색으로 구분, 결과(성과) 쪽은 글자 라벨로만 구분한다.
export type Role = "video" | "awareness" | "traffic" | "engagement" | "conversion" | "search" | "brand_search" | "other";

export const DRIVER_ROLES = ["video", "awareness", "traffic", "engagement"] as const;
export type DriverRole = (typeof DRIVER_ROLES)[number];

export const ROLE_META: Record<Role, { label: string; color: string; kind: "driver" | "outcome" | "other" }> = {
  // 4색 검증(흰 표면, 2026-10-01): 정상시 ΔE ≥ 22.9, CVD 6.1(경계) → 범례·막대 사이 간격·표로 보조
  video: { label: "영상", color: "#4a3aa7", kind: "driver" },
  awareness: { label: "도달·인지", color: "#e87ba4", kind: "driver" },
  traffic: { label: "트래픽", color: "#1baf7a", kind: "driver" },
  engagement: { label: "참여", color: "#eda100", kind: "driver" },
  conversion: { label: "전환", color: "#3B4048", kind: "outcome" },
  search: { label: "검색", color: "#3B4048", kind: "outcome" },
  brand_search: { label: "브랜드검색", color: "#3B4048", kind: "outcome" },
  other: { label: "제외", color: "#A7ACB4", kind: "other" },
};

export const MEDIA_LABEL: Record<string, string> = { meta: "메타", naver: "네이버 SA", gfa: "GFA", kakao: "카카오모먼트" };

const VIDEO_WORDS = /(video|영상|동영상|vvc|tvc|youtube|유튜브|thruplay|reels?|릴스|조회|view)/i;
const BRAND_WORDS = /(브랜드\s*검색|brand\s*search|brandsearch)/i;

// 매체 목표 → 역할. 이름 키워드는 목표가 인지·참여처럼 영상일 수 있는 경우에만 영상으로 좁힐 때 쓴다.
export function guessRole(media: string, objective: string | null, name: string): Role {
  const o = (objective ?? "").toUpperCase();
  const videoName = VIDEO_WORDS.test(name);
  if (media === "naver") {
    if (o === "BRAND_SEARCH" || BRAND_WORDS.test(name)) return "brand_search";
    return "search";
  }
  if (/VIDEO/.test(o)) return "video";
  if (/SALES|CONVERSION|CATALOG|LEAD|INSTALL|APP_PROMOTION|SHOPPING|PURCHASE|MESSAGES/.test(o)) return "conversion";
  if (/TRAFFIC|LINK_CLICKS|VISIT/.test(o)) return videoName ? "video" : "traffic";
  if (/AWARENESS|REACH|BRAND/.test(o)) return videoName ? "video" : "awareness";
  if (/ENGAGEMENT|POST_ENGAGEMENT|PAGE_LIKES|EVENT/.test(o)) return videoName ? "video" : "engagement";
  if (/VIEW/.test(o)) return "video"; // 카카오 goal=VIEW(동영상 조회)
  if (videoName) return "video";
  return "other";
}
