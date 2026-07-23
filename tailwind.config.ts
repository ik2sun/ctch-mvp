import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#15181E",
          soft: "#3B4048",
          muted: "#767C86",
          faint: "#A7ACB4",
        },
        canvas: "#F6F6F4",
        surface: "#FFFFFF",
        line: "#E6E6E2",
        signal: {
          DEFAULT: "#4F46E5",
          soft: "#EEF0FE",
          strong: "#3D34C9",
        },
        good: "#128A6B",
        warn: "#B4690E",
        bad: "#C0392B",
      },
      fontFamily: {
        sans: ["Pretendard", "Inter", "system-ui", "sans-serif"],
        display: ["'Space Grotesk'", "Pretendard", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "12px",
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
