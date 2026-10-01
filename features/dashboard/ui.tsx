"use client";

// 대시보드·리포트 공용 카드와 세그먼트 버튼
import type { ReactNode } from "react";

export function Card({ title, sub, right, children, className = "" }: { title: string; sub?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-card border border-line bg-surface ${className}`}>
      {/* Cake 스타일 — 머리 띠(연회색) + 흰 본문 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas px-6 py-4">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold text-ink">{title}</h3>
          {sub && <p className="mt-0.5 text-[14px] text-ink-muted">{sub}</p>}
        </div>
        {right}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T | null; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[15px] transition ${
            value === o.key ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(21,24,30,0.08)]" : "text-ink-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// 매체 칩 — 색 점으로 매체 식별(MEDIA_COLORS), 선택/비활성 상태
export function MediaChip({
  label,
  color,
  on,
  disabled,
  note,
  title,
  onClick,
}: {
  label: string;
  color: string;
  on: boolean;
  disabled?: boolean;
  note?: string;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on}
      onClick={onClick}
      title={title}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[15px] transition ${
        disabled
          ? "cursor-not-allowed border-dashed border-line text-ink-faint"
          : on
            ? "border-ink/15 bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(21,24,30,0.06)]"
            : "border-line bg-canvas text-ink-muted hover:text-ink"
      }`}
    >
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ background: disabled ? "transparent" : on ? color : "#D9D9D4", border: disabled ? "1px solid #D9D9D4" : undefined }}
        aria-hidden
      />
      {label}
      {note && <span className="text-[12px]">{note}</span>}
    </button>
  );
}
