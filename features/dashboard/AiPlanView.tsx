"use client";

// AI 액션 플랜(대시보드 최상단, 2026-10-04 개편) — 탭 3개(🚨 즉시 조치 / 💡 다음 주 추천 / 📊 주요 이슈), 항목은 첫 문장만 굵게.
// AI가 매체 간 예산 이동을 제안하면(budgetMoves) 탭 위에 카드로 띄우고 [⚡ 예산 재분배 실행하기] → RebalanceDialog → 예산 동기화(SyncDialog).
import { useEffect, useState } from "react";

export type BudgetMove = { from: string; to: string; percent: number; reason: string };
export type AiPlan = { issues: string[]; urgentActions: string[]; nextWeekActions: string[]; budgetMoves?: BudgetMove[] };

type Tab = "urgent" | "next" | "issues";

// 첫 문장(마침표·물음표·느낌표 + 공백, 또는 '~요.')까지 굵게
function splitLead(t: string): [string, string] {
  const m = t.match(/^(.+?[.!?。])(\s+|$)([\s\S]*)$/);
  return m ? [m[1], m[3]] : [t, ""];
}

function Items({ items, tone }: { items: string[]; tone: "bad" | "signal" | "ink" }) {
  const box = tone === "bad" ? "border-bad/25 bg-bad/[0.04]" : tone === "signal" ? "border-signal/15 bg-signal-soft/50" : "border-line bg-canvas";
  return (
    <ol className="grid gap-2.5 lg:grid-cols-2">
      {items.map((t, i) => {
        const [lead, rest] = splitLead(t);
        return (
          <li key={i} className={`flex gap-3 rounded-lg border px-4 py-3 text-[15px] leading-[1.6] ${box}`}>
            <span className="mt-[2px] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-surface text-[12px] font-semibold text-ink-muted ring-1 ring-line">{i + 1}</span>
            <span>
              <b className="font-semibold text-[#1A1A1A]">{lead}</b>
              {rest && <span className="text-ink-soft"> {rest}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function AiPlanView({ plan, moves, onRebalance }: { plan: AiPlan; moves?: (BudgetMove & { fromKey: string; toKey: string })[]; onRebalance?: (m: BudgetMove & { fromKey: string; toKey: string }) => void }) {
  const tabs: { key: Tab; label: string; icon: string; items: string[] }[] = [
    { key: "urgent", label: "즉시 조치", icon: "🚨", items: plan.urgentActions },
    { key: "next", label: "다음 주 추천", icon: "💡", items: plan.nextWeekActions },
    { key: "issues", label: "주요 이슈", icon: "📊", items: plan.issues },
  ];
  const [tab, setTab] = useState<Tab>(plan.urgentActions.length ? "urgent" : "next");
  useEffect(() => setTab(plan.urgentActions.length ? "urgent" : "next"), [plan]);
  const cur = tabs.find((t) => t.key === tab)!;

  return (
    <div className="space-y-4">
      {moves && moves.length > 0 && (
        <ul className="space-y-2">
          {moves.map((m, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-signal/30 bg-signal-soft/60 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[#1A1A1A]">
                  {m.from} 예산 {Math.round(m.percent)}%를 {m.to}로 옮기세요
                </p>
                <p className="mt-0.5 text-[13px] text-ink-soft">{m.reason}</p>
              </div>
              {onRebalance && (
                <button type="button" onClick={() => onRebalance(m)} className="btn-signal h-9 whitespace-nowrap px-4 text-[14px]">
                  ⚡ 예산 재분배 실행하기
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div role="tablist" className="flex flex-wrap gap-1.5 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[15px] transition ${
              tab === t.key ? (t.key === "urgent" && t.items.length ? "border-bad font-semibold text-bad" : "border-signal font-semibold text-ink") : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
            <span className={`rounded-full px-1.5 text-[12px] tabular-nums ${t.key === "urgent" && t.items.length ? "bg-bad/10 text-bad" : "bg-canvas text-ink-muted"}`}>{t.items.length}</span>
          </button>
        ))}
      </div>

      {cur.items.length ? (
        <Items items={cur.items} tone={cur.key === "urgent" ? "bad" : cur.key === "next" ? "signal" : "ink"} />
      ) : cur.key === "urgent" ? (
        <p className="flex items-center gap-2 rounded-lg border border-good/25 bg-good/[0.06] px-4 py-3 text-[15px] text-[#1A1A1A]">
          <span aria-hidden className="text-good">✓</span>
          <span>
            <b className="font-semibold text-good">즉시 조치가 필요한 항목이 없어요.</b> ROAS 급락·CPA 급등 같은 위험 신호가 보이지 않아요.
          </span>
        </p>
      ) : (
        <p className="rounded-lg bg-canvas px-4 py-3 text-[15px] text-ink-muted">{cur.key === "next" ? "추천 액션이 없어요." : "특이 이슈가 없어요."}</p>
      )}
    </div>
  );
}
