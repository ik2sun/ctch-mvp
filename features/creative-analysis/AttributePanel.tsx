"use client";

// 요소별 성과 — 소재명 요소(유형·테마·모델·상품…) 또는 타겟 요소(타겟 유형·연령·성별…)로 묶어 비교.
// 핵심 지표 막대(인디고) + 평균선, 광고비 비중(회색). 소재 3개 미만·판단 가능 2개 미만은 흐리게(표본 부족).
import { useMemo, useState } from "react";
import { fmt } from "@/features/ai-report/calcMetrics";
import { Segmented } from "@/features/dashboard/ui";
import { breakdown, type Dimension, type Enriched } from "./analyze";
import type { ObjectiveGroup } from "./types";

export function AttributePanel({ rows, dims, group, note }: { rows: Enriched[]; dims: Dimension[]; group: ObjectiveGroup; note?: React.ReactNode }) {
  const available = useMemo(() => dims.filter((d) => rows.some((r) => d.get(r) != null)), [dims, rows]);
  const [key, setKey] = useState(available[0]?.key ?? dims[0].key);
  const dim = available.find((d) => d.key === key) ?? available[0];
  const buckets = useMemo(() => (dim ? breakdown(rows, dim).slice(0, 14) : []), [rows, dim]);
  const sales = group === "sales";
  const main = (b: (typeof buckets)[number]) => (sales ? b.roas : b.ctr);
  const totalCost = rows.reduce((a, r) => a + r.cost, 0);
  const avg = sales
    ? totalCost > 0
      ? rows.reduce((a, r) => a + r.revenue, 0) / totalCost
      : null
    : rows.reduce((a, r) => a + r.impressions, 0) > 0
      ? rows.reduce((a, r) => a + r.linkClicks, 0) / rows.reduce((a, r) => a + r.impressions, 0)
      : null;
  const max = Math.max(0.0001, ...buckets.map((b) => main(b) ?? 0), avg ?? 0);

  if (!dim) return <p className="py-8 text-center text-[15px] text-ink-muted">분석할 요소가 없어요.</p>;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented value={dim.key} options={available.map((d) => ({ key: d.key, label: d.label }))} onChange={setKey} />
        <span className="flex items-center gap-4 text-[15px] text-ink-muted">
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-signal" aria-hidden />
            {sales ? "ROAS" : "CTR"}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-px bg-ink" aria-hidden />
            평균 {sales ? fmt(avg, "x") : fmt(avg, "pct")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-ink-faint" aria-hidden />
            광고비 비중
          </span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[15px]">
          <thead>
            <tr className="border-b border-line text-[15px] text-ink-muted">
              <th className="py-3 pr-3 text-left font-medium">{dim.label}</th>
              <th className="px-3 py-3 text-right font-medium">소재</th>
              <th className="w-[34%] px-2 py-2 text-left font-medium">{sales ? "ROAS" : "CTR"} · 광고비 비중</th>
              <th className="px-3 py-3 text-right font-medium">광고비</th>
              {sales ? (
                <>
                  <th className="px-3 py-3 text-right font-medium">CPA</th>
                  <th className="px-3 py-3 text-right font-medium">CTR</th>
                  <th className="px-3 py-3 text-right font-medium">CVR</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-3 text-right font-medium">CPM</th>
                  <th className="px-3 py-3 text-right font-medium">노출</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {buckets.map((b) => {
              const thin = b.count < 3 || b.judged < 2;
              const m = main(b);
              return (
                <tr key={b.key} className={`border-b border-line/60 ${thin ? "opacity-50" : ""}`} title={thin ? "소재 수가 적어 참고만 하세요" : undefined}>
                  <td className="max-w-[240px] py-3.5 pr-3">
                    <span className="block truncate font-semibold text-[#1A1A1A]" title={b.key}>
                      {b.key}
                    </span>
                    {b.top > 0 && <span className="text-[13px] text-good">↗ 상위 소재 {b.top}개</span>}
                    {thin && <span className="text-[13px] text-ink-muted">표본 부족</span>}
                  </td>
                  <td className="px-3 py-3.5 text-right text-ink-soft">{b.count}</td>
                  <td className="px-3 py-3.5">
                    <div className="space-y-[3px]">
                      <div className="relative flex items-center gap-2">
                        <div className="relative h-2.5 flex-1">
                          <div className="h-full rounded-r-[4px] bg-signal" style={{ width: `${((m ?? 0) / max) * 100}%` }} />
                          {avg != null && <div className="absolute -top-0.5 h-3.5 w-px bg-ink" style={{ left: `${(avg / max) * 100}%` }} aria-hidden />}
                        </div>
                        <span className="w-16 text-right text-[16px] font-semibold text-[#1A1A1A]">{sales ? fmt(m, "x") : fmt(m, "pct")}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1">
                          <div className="h-full rounded-r-[3px] bg-ink-faint" style={{ width: `${b.costShare * 100}%` }} />
                        </div>
                        <span className="w-16 text-right text-[13px] text-ink-muted">{(b.costShare * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right font-semibold text-ink-soft">{fmt(b.cost, "won")}</td>
                  {sales ? (
                    <>
                      <td className="px-3 py-3.5 text-right font-semibold text-ink-soft">{fmt(b.cpa, "won")}</td>
                      <td className="px-3 py-3.5 text-right font-semibold text-ink-soft">{fmt(b.ctr, "pct")}</td>
                      <td className="px-3 py-3.5 text-right font-semibold text-ink-soft">{fmt(b.cvr, "pct")}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-3.5 text-right font-semibold text-ink-soft">{fmt(b.cpm, "won")}</td>
                      <td className="px-3 py-3.5 text-right font-semibold text-ink-soft">{fmt(b.impressions, "int")}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {note && <div className="mt-4 text-[13px] leading-relaxed text-ink-muted">{note}</div>}
    </div>
  );
}
