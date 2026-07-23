import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CTCH · AI 퍼포먼스 마케팅 대시보드",
  description:
    "미디어믹스, UTM 자동화, AI 리포트까지 — 마케터의 신호를 캐치하는 퍼포먼스 대시보드",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
