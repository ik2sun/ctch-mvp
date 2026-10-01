"use client";

// 피로도 목록 · 세팅 점검 목록
import { fmt } from "@/features/ai-report/calcMetrics";
import type { Fatigue, SettingCheck } from "./analyze";
import { Thumb } from "./CreativeGallery";

function CtrSpark({ points }: { points: { impressions: number; clicks: number }[] }) {
  const v = points.map((p) => (p.impressions > 0 ? p.clicks / p.impressions : null));
  const vals = v.filter((x): x is number => x != null);
  if (vals.length < 2) return null;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const w = 96;
  const h = 28;
  const d = v
    .map((x, i) => (x == null ? null : `${(i / (v.length - 1)) * (w - 4) + 2},${h - 3 - ((x - min) / span) * (h - 6)}`))
    .filter(Boolean)
    .map((p, i) => `${i ? "L" : "M"}${p}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-24" aria-hidden>
      <path d={d} fill="none" stroke="#C0392B" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function FatigueList({ items, onOpen }: { items: Fatigue[]; onOpen: (id: string) => void }) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-1 py-8 text-center">
        <i className="ti ti-circle-check text-[20px] text-good" aria-hidden />
        <p className="text-[15px] text-ink-soft">피로 신호가 보이는 소재가 없어요.</p>
        <p className="text-[12px] text-ink-muted">광고비 상위 40개 소재 중 7일 이상 집행·빈도 2회 이상에서 CTR이 초반 대비 30% 넘게 떨어진 소재를 찾아요.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line/70">
      {items.slice(0, 8).map((f) => (
        <li key={f.row.id}>
          <button type="button" onClick={() => onOpen(f.row.id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-canvas/60">
            <Thumb row={f.row} className="h-12 w-12 flex-shrink-0 rounded" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-[13px] text-ink">{f.row.name}</p>
              <p className="text-[13px] tabular-nums text-ink-muted">
                CTR {(f.ctrFirst * 100).toFixed(2)}% → {(f.ctrLast * 100).toFixed(2)}% · 빈도 {f.row.frequency.toFixed(1)} · {f.days}일 · 광고비 {fmt(f.row.cost, "won")}
              </p>
            </div>
            <CtrSpark points={f.row.daily ?? []} />
            <span className="w-20 whitespace-nowrap text-right text-[15px] font-semibold tabular-nums text-bad">↘ −{Math.abs(f.drop * 100).toFixed(0)}%</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const TONE = {
  bad: { icon: "ti-alert-triangle", label: "확인 필요", cls: "text-bad", bg: "bg-bad/10" },
  warn: { icon: "ti-alert-circle", label: "점검", cls: "text-warn", bg: "bg-warn/10" },
  info: { icon: "ti-info-circle", label: "참고", cls: "text-signal", bg: "bg-signal-soft" },
};

export function SettingCheckList({ checks, max = 6, columns = false }: { checks: SettingCheck[]; max?: number; columns?: boolean }) {
  if (!checks.length) {
    return (
      <div className="flex flex-col items-center gap-1 py-8 text-center">
        <i className="ti ti-circle-check text-[20px] text-good" aria-hidden />
        <p className="text-[15px] text-ink-soft">세팅에서 눈에 띄는 문제가 없어요.</p>
      </div>
    );
  }
  return (
    <ul className={columns ? "gap-4 lg:columns-2 2xl:columns-3 [&>li]:mb-4 [&>li]:break-inside-avoid" : "space-y-3"}>
      {checks.slice(0, max).map((c) => {
        const t = TONE[c.tone];
        return (
          <li key={c.id} className="flex gap-3.5 rounded-lg border border-line/80 px-4 py-3.5">
            <span className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${t.bg}`}>
              <i className={`ti ${t.icon} text-[17px] ${t.cls}`} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[16px] font-semibold text-[#1A1A1A]">
                <span className={`mr-2 text-[13px] font-semibold ${t.cls}`}>{t.label}</span>
                <span className="break-all">{c.title}</span>
              </p>
              <p className="mt-1 break-all text-[15px] leading-relaxed text-ink-soft">{c.detail}</p>
            </div>
          </li>
        );
      })}
      {checks.length > max && <li className="py-2 text-center text-[13px] text-ink-muted">외 {checks.length - max}건</li>}
    </ul>
  );
}
