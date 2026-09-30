"use client";

import { ENGINE_COLOR, ENGINE_LABEL, type GeoEngine } from "./types";

export function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "bad" | "warn" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-[12px] text-ink-muted">{label}</p>
      <p className={`mt-0.5 font-display text-[22px] font-semibold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-muted">{sub}</p>}
    </div>
  );
}

export function Section({ title, desc, children, right }: { title: string; desc?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="text-[13px] font-medium text-ink-soft">{title}</span>
          {desc && <p className="text-[11px] text-ink-muted">{desc}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

// 엔진 이름 옆 색 점 — 글자는 잉크색, 색은 점만 (색만으로 구분하지 않음)
export function EngineName({ engine, className = "" }: { engine: GeoEngine; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ENGINE_COLOR[engine] }} aria-hidden />
      {ENGINE_LABEL[engine]}
    </span>
  );
}

export const pctText = (n: number | null | undefined, digits = 0) => (n === null || n === undefined ? "-" : `${(n * 100).toFixed(digits)}%`);

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-bad/20 bg-bad/5 px-3.5 py-2.5 text-[13px] text-bad">{children}</p>;
}
