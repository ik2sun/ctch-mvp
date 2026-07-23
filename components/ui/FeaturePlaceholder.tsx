// 아직 개발 전인 기능 페이지의 자리표시자 — 빈 화면이 아니라 다음 단계를 안내
export function FeaturePlaceholder({
  icon,
  title,
  desc,
  step,
  priority,
}: {
  icon: string;
  title: string;
  desc: string;
  step: string;
  priority?: boolean;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-card bg-signal-soft">
          <i className={`ti ti-${icon} text-[26px] text-signal`} aria-hidden />
        </div>
        <div className="mb-2 flex items-center justify-center gap-2">
          <h2 className="text-[18px] font-semibold text-ink">{title}</h2>
          {priority && (
            <span className="rounded-full bg-signal-soft px-2 py-0.5 text-[11px] font-medium text-signal">
              우선 개발
            </span>
          )}
        </div>
        <p className="text-[15px] leading-relaxed text-ink-muted">{desc}</p>
        <p className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 font-mono text-[12px] text-ink-muted">
          <span className="signal-dot" /> {step}
        </p>
      </div>
    </div>
  );
}
