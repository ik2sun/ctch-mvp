"use client";

// 세그먼트 컨트롤 — 탭 전환용 토글 버튼 그룹 (Vercel/Linear 스타일)
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; icon?: string; hint?: string }[];
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-[15px] transition-all duration-150 ${
              on
                ? "bg-white font-medium text-signal shadow-sm ring-1 ring-signal/15"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {o.icon && <i className={`ti ti-${o.icon} text-[16px]`} aria-hidden />}
            {o.label}
            {o.hint && (
              <span className={`font-mono text-[12px] ${on ? "text-signal/60" : "text-gray-400"}`}>{o.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
