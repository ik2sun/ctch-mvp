import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Cake 스타일(2026-10-01): 차가운 남색·회색. 대비(흰 바탕) ink 17.8 · soft 10.5 · muted 7.6 · faint 2.6(비활성·장식 전용)
        ink: {
          DEFAULT: "#101828",
          soft: "#344054",
          muted: "#475467", // 라벨·보조 문구 — 흰 바탕 7.6:1 (2026-10-01 "흐릿하다" 피드백으로 #667085에서 진하게)
          faint: "#98A2B3", // 비활성·장식 전용(2.6:1) — 읽어야 하는 글자에는 쓰지 말 것
        },
        canvas: "#F9FAFB", // 면 채움(카드 머리 띠·칩·합계 행). 페이지 바탕은 흰색
        surface: "#FFFFFF",
        line: "#EAECF0",
        signal: {
          DEFAULT: "#4F46E5",
          soft: "#F4F3FF",
          strong: "#3D34C9",
        },
        good: "#15803D", // 상승·긍정 — 맑은 녹색, 흰 바탕 5.0:1
        warn: "#C2410C", // 점검·주의 — 주황, 5.2:1
        bad: "#DC2626", // 하락·부정 — 빨강, 4.8:1
      },
      fontFamily: {
        // 숫자·한글 혼용 가독성 — 전부 Pretendard(display도 같은 서체, 2026-10-01)
        // Noto Sans KR — Windows에서 가장 선명(실측 비교 2026-10-01). 폴백 Pretendard(정적)·맑은 고딕
        sans: ["\"Noto Sans KR\"", "Pretendard", "\"Malgun Gothic\"", "system-ui", "sans-serif"],
        display: ["\"Noto Sans KR\"", "Pretendard", "\"Malgun Gothic\"", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
      keyframes: {
        sweep: {
          "0%": { transform: "scale(0.6)", opacity: "0.55" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
      },
      animation: {
        sweep: "sweep 2.6s ease-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
