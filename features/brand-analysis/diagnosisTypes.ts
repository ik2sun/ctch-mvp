// AI 진단 결과 스키마 — 서버 라우트와 화면이 공유
export const CONTENT_TYPES = ["제품소개", "이벤트", "UGC/후기", "브랜딩", "인플루언서/협업", "비하인드", "정보/팁", "기타"] as const;
export const HOOK_TYPES = ["질문", "숫자/리스트", "혜택/할인", "공감", "충격/반전", "스토리", "없음"] as const;
export const CTA_TYPES = ["링크유도", "댓글유도", "저장/공유유도", "구매/예약", "이벤트참여", "없음"] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];
export type HookType = (typeof HOOK_TYPES)[number];
export type CtaType = (typeof CTA_TYPES)[number];

export type PostTag = {
  id: string;
  contentType: ContentType;
  hookType: HookType;
  ctaType: CtaType;
  insight: string;
};

export type Diagnosis = {
  summary: string;
  winningPattern: string;
  losingPattern: string;
  suggestions: string[];
  adCandidates: Array<{ id: string; reason: string }>;
  posts: PostTag[];
};
