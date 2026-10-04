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

// ── 캠페인 매니저(광고주별) ─────────────────────────────

export const PM_MODEL = "claude-sonnet-5-5";

// 메일 수집 조건·시장 정보(pm_client_settings) — 특정인 = 주소(mailAddresses) + 도메인 전체(mailDomains)
// mailMatch: any = 특정인 또는 키워드 하나라도 / all = 특정인 AND 키워드(교집합)
export type PmSettings = {
  mailDomains: string[];
  mailAddresses: string[];
  mailKeywords: string[];
  mailMatch: "any" | "all";
  competitors: string[];
  marketNotes: string;
  updatedAt: string | null;
  updatedBy: string | null;
};

export const EMPTY_SETTINGS: PmSettings = { mailDomains: [], mailAddresses: [], mailKeywords: [], mailMatch: "any", competitors: [], marketNotes: "", updatedAt: null, updatedBy: null };

// 민감 메일 차단 — 기본(코드, 끌 수 없음) + 관리자 추가분(pm_mail_block)
export type BlockInfo = { defaults: { keywords: string[]; senderWords: string[] }; extra: { keywords: string[]; senders: string[] }; canEdit: boolean };

// 프로젝트 멤버(구 캠페인 담당자 + 특정인) — 사람 한 번만 등록하고 쓰임은 옵션으로
//  ownerEmail: 주소 또는 '@도메인'(회사 전체) / side: NMG·광고주·파트너
//  matchText: '' = 맡은 캠페인 없음, '*' = 나머지 캠페인 전부, 그 밖 = 캠페인 이름에 이 글자가 있으면 담당
//  collect: 이 사람이 주고받은 메일을 수집(= 메일 수집 조건의 '특정인')
export type MemberSide = "nmg" | "client" | "partner";
export type CampaignOwner = { id?: string; ownerEmail: string; ownerName: string; matchText: string; media: string | null; side: MemberSide; collect: boolean };
export const SIDE_LABEL: Record<MemberSide, string> = { nmg: "NMG", client: "광고주", partner: "파트너" };

// CTCH에 연결된 담당자 Gmail(토큰 제외)
// shared: 주인이 이 광고주에 공유를 허락했고 그 뒤 규칙이 안 바뀜 / shareStale: 허락 후 규칙이 바뀌어 다시 허락 필요
export type MailboxInfo = { email: string; name: string | null; linkedAt: string; lastSyncedAt: string | null; lastError: string | null; mine: boolean; shared: boolean; shareStale: boolean };

export type SyncResult = { mailbox: string; found: number; added: number; merged: number; blocked?: number; error?: string };

// 모은 메일 현황 — 메일함별(CTCH 연결 동기화 + Claude Code MCP 가져오기 합산)
export type MailStats = { count: number; lastAt: string | null; byMailbox: { email: string; count: number; lastImportedAt: string | null }[] };

// 메일 AI 정리 — 출처는 메일 날짜·제목으로 남긴다(source)
export type MemoryItem = { content: string; date: string; campaign: string; owner: string; source: string };
export type MemoryRequest = MemoryItem & { from: string; due: string; status: string }; // status: 미해결 | 완료 | 확인 필요
export type PmMemory = {
  summary: string;
  kpis: { item: string; value: string; source: string }[];
  agreements: MemoryItem[];
  requests: MemoryRequest[];
  schedule: MemoryItem[];
  issues: MemoryItem[];
  contacts: { name: string; email: string; side: string; role: string }[];
};
export type MemoryMeta = { builtAt: string; emailCount: number; lastEmailAt: string | null; builtBy: string | null };

// 채팅 — 저장하지 않는다(화면 메모리에만). 서버에는 텍스트만 다시 보낸다.
export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "skill"; name: string; label: string }
  | { type: "tool"; label: string } // 캠페인 성과·메일 검색 등 데이터 도구 사용 표시
  | { type: "search"; query: string }
  | { type: "sources"; items: { title: string; url: string }[] }
  | { type: "done" }
  | { type: "error"; message: string };
