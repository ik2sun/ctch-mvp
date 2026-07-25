import type { BrandColors, ThemeId } from "./types";

export type ThemeDef = {
  id: ThemeId;
  label: string;
  description: string;
  background: string;
  accent: string;
  text: string; // 본문 텍스트 색
  coverAnimation: "particles" | "aos-fade" | "gradient-mesh";
  fontDisplay: string;
};

export const THEMES: Record<ThemeId, ThemeDef> = {
  premium: {
    id: "premium",
    label: "모던 프리미엄",
    description: "딥 네이비 배경 + 골드 포인트, 파티클 표지",
    background: "#0A1628",
    accent: "#F5C842",
    text: "#F4F6FB",
    coverAnimation: "particles",
    fontDisplay: "'Pretendard', 'Noto Sans KR', sans-serif",
  },
  minimal: {
    id: "minimal",
    label: "클린 미니멀",
    description: "화이트 배경 + 로얄블루 포인트, 좌측 컬러 블록 표지",
    background: "#FFFFFF",
    accent: "#2563EB",
    text: "#15181E",
    coverAnimation: "aos-fade",
    fontDisplay: "'Pretendard', 'Noto Sans KR', sans-serif",
  },
  bold: {
    id: "bold",
    label: "임팩트 볼드",
    description: "차콜 배경 + 비비드 그린 포인트, 그라데이션 메시 표지",
    background: "#111827",
    accent: "#10B981",
    text: "#F4F6FB",
    coverAnimation: "gradient-mesh",
    fontDisplay: "'Pretendard', 'Noto Sans KR', sans-serif",
  },
};

// 광고주 브랜드 컬러가 지정되면 배경/포인트 색만 오버라이드
export function resolveTheme(themeId: ThemeId, brandColors: BrandColors): ThemeDef {
  const base = THEMES[themeId];
  if (!brandColors) return base;
  return { ...base, background: brandColors.background, accent: brandColors.accent };
}
