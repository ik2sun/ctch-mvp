// CTCH 로고 — 원본은 logo/ctch-soft-tech-color.svg, public/ctch-logo.svg는 여백을 잘라 낸 버전(위쪽 끝 = 심볼 위쪽 끝)
export function Wordmark({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const h = size === "xl" ? "h-12" : size === "lg" ? "h-8" : size === "sm" ? "h-[18px]" : "h-5";
  return <img src="/ctch-logo.svg" alt="CTCH" className={`${h} w-auto ${className}`} />;
}
