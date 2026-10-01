// 퍼포먼스 매니저 — 화면·API 공용 타입

export type BriefPlatform = "meta" | "google" | "naver" | "kakao" | "measurement" | "industry";
export type BriefKind = "update" | "seminar" | "guide";

// 최신 정보 카드 — 출처 URL이 있는 사실만. 날짜는 공식 발표·행사일(YYYY-MM 또는 YYYY-MM-DD)
export type Brief = {
  id: string;
  platform: BriefPlatform;
  kind: BriefKind;
  title: string;
  date: string;
  summary: string; // 2~3문장
  takeaways: string[]; // 국내 퍼포먼스 마케터가 바로 할 일 1~3개
  source: { name: string; url: string };
};

export const PLATFORM_META: Record<BriefPlatform, { label: string; color: string }> = {
  meta: { label: "메타", color: "#2a78d6" },
  google: { label: "구글", color: "#e87ba4" },
  naver: { label: "네이버", color: "#1baf7a" },
  kakao: { label: "카카오", color: "#eda100" },
  measurement: { label: "측정", color: "#4a3aa7" },
  industry: { label: "업계", color: "#767C86" },
};

export const KIND_LABEL: Record<BriefKind, string> = { update: "제품 업데이트", seminar: "세미나·행사", guide: "가이드·리포트" };

// 채팅 — 저장하지 않는다(화면 메모리에만). 서버에는 텍스트만 다시 보낸다.
export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "skill"; name: string; label: string }
  | { type: "search"; query: string }
  | { type: "sources"; items: { title: string; url: string }[] }
  | { type: "done" }
  | { type: "error"; message: string };
