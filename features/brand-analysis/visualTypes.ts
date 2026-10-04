// 인스타 시각 분석 — 게시물 이미지(릴스는 커버 = 첫 화면)를 Claude 비전으로 태깅한 결과. 서버·화면 공용.
// 영상 자체는 받을 수 없어 '릴스 초반 3초'는 커버 텍스트로 대신한다(화면에 그렇게 표기).
export const PEOPLE = ["얼굴", "신체 일부", "없음"] as const;
export const SUBJECTS = ["제품 단독", "착용·사용", "라이프스타일", "텍스트·그래픽", "기타"] as const;
export const TONES = ["밝음", "중간", "어두움"] as const;

export type VisualTag = {
  id: string;
  people: (typeof PEOPLE)[number];
  subject: (typeof SUBJECTS)[number];
  tone: (typeof TONES)[number];
  textOverlay: boolean; // 이미지 위 글자(커버 훅 텍스트 포함)
  overlayText: string; // 읽힌 글자(최대 40자)
};

export type VisualResult = { posts: VisualTag[]; analyzed: number; skipped: number };

export const CATEGORIES = ["패션/의류", "슈즈/잡화", "뷰티", "식품/F&B", "건강/헬스케어", "리빙/가전", "여행/레저", "교육", "IT/앱", "금융", "엔터/미디어", "기타"] as const;
