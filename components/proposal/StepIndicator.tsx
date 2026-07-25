const STEPS = ["기본 정보", "AI 리서치", "참고자료", "콘텐츠 생성", "프레젠테이션"];

export default function StepIndicator({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <li key={label} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold ${
                active
                  ? "bg-signal text-white"
                  : done
                    ? "bg-signal-soft text-signal"
                    : "bg-canvas text-ink-faint border border-line"
              }`}
            >
              {n}
            </div>
            <span className={`text-[13px] ${active ? "font-semibold text-ink" : "text-ink-muted"}`}>
              {label}
            </span>
            {n < STEPS.length && <span className="mx-1 h-px w-6 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}
