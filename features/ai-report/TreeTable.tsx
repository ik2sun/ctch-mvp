"use client";

import { useState } from "react";
import { fmt } from "./calcMetrics";
import {
  derive,
  TAG_META,
  type MetaHierarchy,
  type MetaRow,
  type SmartStatus,
  type DailyPoint,
} from "./metaTypes";

// 의존성 없는 미니 스파크라인
function Sparkline({
  points,
  pick,
  color = "#4F46E5",
}: {
  points: DailyPoint[];
  pick: (d: DailyPoint) => number;
  color?: string;
}) {
  if (!points || points.length < 2) return null;
  const vals = points.map(pick);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;
  const w = 54;
  const h = 16;
  const step = w / (vals.length - 1);
  const d = vals
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="ml-auto block opacity-80" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function Badge({ status }: { status: SmartStatus }) {
  const t = TAG_META[status.tag];
  if (!t) return null;
  return (
    <span
      title={status.reason}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${t.cls}`}
    >
      {t.emoji} {t.label}
    </span>
  );
}

export function TreeTable({
  data,
  statuses,
  view = "campaign",
}: {
  data: MetaHierarchy;
  statuses: SmartStatus[];
  view?: "campaign" | "adset" | "ad";
}) {
  const [openC, setOpenC] = useState<Record<string, boolean>>({});
  const [openA, setOpenA] = useState<Record<string, boolean>>({});

  const statusById = new Map(statuses.map((s) => [String(s.id), s]));
  const byCost = (a: MetaRow, b: MetaRow) => b.cost - a.cost;

  function Row({ r, depth }: { r: MetaRow; depth: 0 | 1 | 2 }) {
    const d = derive(r);
    const st = statusById.get(String(r.id));
    const fatigue = r.frequency >= 3 && (d.ctr ?? 1) < 0.01;
    const isC = depth === 0;
    const isA = depth === 1;
    const expandable = isC || isA;
    const open = isC ? openC[r.id] : isA ? openA[r.id] : false;

    function toggle() {
      if (isC) setOpenC((p) => ({ ...p, [r.id]: !p[r.id] }));
      if (isA) setOpenA((p) => ({ ...p, [r.id]: !p[r.id] }));
    }

    return (
      <tr className={`border-t border-line ${depth === 2 ? "bg-canvas/40" : ""}`}>
        <td className="px-2 py-2">
          <div className="flex items-start gap-1.5" style={{ paddingLeft: depth * 16 }}>
            {expandable ? (
              <button
                onClick={toggle}
                className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border border-line text-ink-muted transition hover:border-signal hover:text-signal"
                aria-label={open ? "접기" : "펼치기"}
              >
                <i className={`ti ${open ? "ti-minus" : "ti-plus"} text-[11px]`} aria-hidden />
              </button>
            ) : (
              <span className="mt-0.5 h-4 w-4 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <div className={`truncate ${isC ? "font-medium text-ink" : "text-ink-soft"}`}>
                {r.name}
              </div>
              {st && (
                <div className="mt-1">
                  <Badge status={st} />
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-2 py-2 text-right text-ink-soft">{fmt(r.impressions, "int")}</td>
        <td className={`px-2 py-2 text-right ${fatigue ? "font-medium text-warn" : "text-ink-soft"}`}>
          {r.frequency ? r.frequency.toFixed(1) : "—"}
        </td>
        <td className="px-2 py-2 text-right text-ink-soft">{fmt(d.ctr, "pct")}</td>
        <td className="px-2 py-2 text-right">
          <div className="text-ink-soft">{fmt(r.cost, "won")}</div>
          {r.daily && <Sparkline points={r.daily} pick={(p) => p.cost} color="#767C86" />}
        </td>
        <td className="px-2 py-2 text-right text-ink-soft">{fmt(r.conversions, "int")}</td>
        <td className="px-2 py-2 text-right text-ink-soft">{fmt(d.cpa, "won")}</td>
        <td className="px-2 py-2 text-right">
          <div className="font-medium text-ink">{fmt(d.roas, "x")}</div>
          {r.daily && (
            <Sparkline
              points={r.daily}
              pick={(p) => (p.cost ? p.revenue / p.cost : 0)}
            />
          )}
        </td>
      </tr>
    );
  }

  const campaigns = [...data.campaigns].sort(byCost);

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-[12px]">
        <thead className="bg-canvas text-ink-muted">
          <tr>
            <th className="px-2 py-2 font-medium">{view === "campaign" ? "캠페인 / 광고세트 / 소재" : view === "adset" ? "광고 세트" : "광고 소재"}</th>
            <th className="px-2 py-2 text-right font-medium">노출</th>
            <th className="px-2 py-2 text-right font-medium">빈도</th>
            <th className="px-2 py-2 text-right font-medium">CTR</th>
            <th className="px-2 py-2 text-right font-medium">광고비</th>
            <th className="px-2 py-2 text-right font-medium">전환</th>
            <th className="px-2 py-2 text-right font-medium">CPA</th>
            <th className="px-2 py-2 text-right font-medium">ROAS</th>
          </tr>
        </thead>
        <tbody>
          {view !== "campaign" &&
            [...(view === "adset" ? data.adsets : data.ads)].sort(byCost).map((r) => (
              <Row key={r.id} r={r} depth={0} />
            ))}
          {view === "campaign" && campaigns.map((c) => {
            const sets = data.adsets.filter((a) => a.campaignId === c.id).sort(byCost);
            return (
              <Fragmentish key={c.id}>
                <Row r={c} depth={0} />
                {openC[c.id] &&
                  sets.map((s) => {
                    const creatives = data.ads.filter((ad) => ad.adsetId === s.id).sort(byCost);
                    return (
                      <Fragmentish key={s.id}>
                        <Row r={s} depth={1} />
                        {openA[s.id] && creatives.map((ad) => <Row key={ad.id} r={ad} depth={2} />)}
                        {openA[s.id] && creatives.length === 0 && (
                          <tr className="border-t border-line bg-canvas/40">
                            <td colSpan={8} className="px-2 py-2 pl-12 text-[11px] text-ink-muted">
                              이 광고세트에 소재 데이터가 없어요.
                            </td>
                          </tr>
                        )}
                      </Fragmentish>
                    );
                  })}
                {openC[c.id] && sets.length === 0 && (
                  <tr className="border-t border-line">
                    <td colSpan={8} className="px-2 py-2 pl-8 text-[11px] text-ink-muted">
                      이 캠페인에 광고세트 데이터가 없어요.
                    </td>
                  </tr>
                )}
              </Fragmentish>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// tbody 안에서 key를 유지하며 여러 tr을 묶기 위한 헬퍼
function Fragmentish({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
