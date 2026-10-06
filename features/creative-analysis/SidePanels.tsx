"use client";

// 피로도 목록 · 세팅 점검 목록
import { useEffect, useRef, useState } from "react";
import { fmt } from "@/features/ai-report/calcMetrics";
import { DEFAULT_FATIGUE, type Fatigue, type FatigueRule, type SettingCheck } from "./analyze";
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

export const ruleText = (r: FatigueRule) => `${r.minDays}일 이상 집행 · 빈도 ${r.minFreq}회 이상 · 처음 ${r.window}일 대비 마지막 ${r.window}일 CTR −${Math.round(r.drop * 100)}% 이상`;
const isDefault = (r: FatigueRule) => (Object.keys(DEFAULT_FATIGUE) as (keyof FatigueRule)[]).every((k) => r[k] === DEFAULT_FATIGUE[k]);

// 피로도 기준 편집 — 기본값은 DEFAULT_FATIGUE, 바꾼 값은 화면이 이 브라우저에 기억
export function FatigueRuleEditor({ rule, onChange }: { rule: FatigueRule; onChange: (r: FatigueRule) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const [f, setF] = useState<Record<keyof FatigueRule, string>>({ minDays: "", minFreq: "", drop: "", window: "" });
  const W = 300;
  // 카드(overflow-hidden)에 잘리지 않게 화면 기준(fixed)으로 띄우고, 화면 가장자리에선 안쪽으로 붙인다
  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.min(Math.max(16, r.right - W), window.innerWidth - W - 16);
    const below = r.bottom + 6;
    setPos({ top: below + 340 > window.innerHeight ? Math.max(16, r.top - 346) : below, left });
  };
  const start = () => {
    setF({ minDays: String(rule.minDays), minFreq: String(rule.minFreq), drop: String(Math.round(rule.drop * 100)), window: String(rule.window) });
    place();
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  const n = (v: string, min: number, max: number, fb: number) => {
    const x = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(x) && x >= min && x <= max ? x : fb;
  };
  const save = () => {
    const window = Math.round(n(f.window, 1, 7, rule.window));
    onChange({ window, minDays: Math.max(Math.round(n(f.minDays, 2, 60, rule.minDays)), window * 2), minFreq: n(f.minFreq, 1, 20, rule.minFreq), drop: n(f.drop, 5, 90, rule.drop * 100) / 100 });
    setOpen(false);
  };
  const FIELDS: { k: keyof FatigueRule; label: string; unit: string; hint: string }[] = [
    { k: "minDays", label: "최소 집행일", unit: "일", hint: "2~60, 비교 구간×2 이상" },
    { k: "minFreq", label: "최소 빈도", unit: "회", hint: "1~20, 기간 평균 노출 빈도" },
    { k: "window", label: "비교 구간", unit: "일", hint: "1~7, 처음 n일 vs 마지막 n일" },
    { k: "drop", label: "CTR 하락", unit: "% 이상", hint: "5~90" },
  ];
  return (
    <span className="relative inline-flex">
      <button ref={btn} type="button" onClick={() => (open ? setOpen(false) : start())} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-surface px-2.5 py-1 text-[13px] text-ink-soft hover:border-[#F45B35]/60" title={`${ruleText(rule)}${isDefault(rule) ? " (기본)" : " (변경됨)"}`}>
        {!isDefault(rule) && <span className="h-1.5 w-1.5 rounded-full bg-[#F45B35]" aria-label="기본값에서 바뀜" />}
        기준 수정 <span aria-hidden>✎</span>
      </button>
      {open && (
        <div className="fixed z-50 w-[300px] rounded-xl border border-line bg-surface p-4 shadow-[0_12px_32px_rgba(16,24,40,0.14)]" style={{ top: pos.top, left: pos.left }} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <p className="text-[13px] font-semibold text-ink">피로도 기준</p>
          {FIELDS.map((x) => (
            <label key={x.k} className="mt-2.5 flex items-center justify-between gap-2 text-[13px] text-ink-soft" title={x.hint}>
              <span>
                {x.label}
                <span className="block text-[11px] text-ink-muted">{x.hint}</span>
              </span>
              <span className="flex items-center gap-1 whitespace-nowrap">
                <input value={f[x.k]} onChange={(e) => setF((s) => ({ ...s, [x.k]: e.target.value }))} inputMode="decimal" className="h-8 w-[64px] rounded border border-line px-2 text-right tabular-nums outline-none focus:border-[#F45B35]" aria-label={x.label} />
                {x.unit}
              </span>
            </label>
          ))}
          <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">일별 데이터는 광고비 상위 40개 소재만 받아요. 바꾼 기준은 이번 주 결정(키우기 → 지켜보기)에도 똑같이 쓰여요.</p>
          <div className="mt-3 flex items-center justify-between">
            <button type="button" onClick={() => (onChange(DEFAULT_FATIGUE), setOpen(false))} className="text-[12px] text-ink-muted hover:text-ink">
              기본값으로
            </button>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setOpen(false)} className="h-8 px-2.5 text-[13px] text-ink-muted hover:text-ink">
                취소
              </button>
              <button type="button" onClick={save} className="h-8 rounded-lg bg-[#F45B35] px-3 text-[13px] font-semibold text-white hover:brightness-95">
                적용
              </button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

export function FatigueList({ items, onOpen, rule = DEFAULT_FATIGUE }: { items: Fatigue[]; onOpen: (id: string) => void; rule?: FatigueRule }) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-1 py-8 text-center">
        <i className="ti ti-circle-check text-[20px] text-good" aria-hidden />
        <p className="text-[15px] text-ink-soft">피로 신호가 보이는 소재가 없어요.</p>
        <p className="text-[12px] text-ink-muted">광고비 상위 40개 소재 중 {ruleText(rule)}인 소재를 찾아요.</p>
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
      <li className="pt-2.5 text-[12px] text-ink-muted">
        기준: {ruleText(rule)}
        {items.length > 8 && ` · 광고비 상위 8개만 표시(전체 ${items.length}개)`}
      </li>
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
