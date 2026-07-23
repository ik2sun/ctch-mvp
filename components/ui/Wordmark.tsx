// CTCH 워드마크 — 마지막 '시그널 닷'이 브랜드 장치
export function Wordmark({
  size = "md",
}: {
  size?: "sm" | "md" | "lg";
}) {
  const scale =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-xl";
  const dot =
    size === "lg" ? "h-2 w-2" : size === "sm" ? "h-[5px] w-[5px]" : "h-[6px] w-[6px]";
  return (
    <span className={`inline-flex items-end gap-[3px] font-display font-semibold tracking-tight text-ink ${scale}`}>
      CTCH
      <span className={`mb-[3px] rounded-full bg-signal ${dot}`} aria-hidden />
    </span>
  );
}
