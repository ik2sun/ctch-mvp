"use client";

// 예산 비중 vs 매출 기여 — 매체마다 두 막대(회색=예산 비중, 인디고=매출 기여)를 나란히. 차이(%p)는 아이콘+글자로 표시.
// 매출이 큰 쪽이면 같은 돈으로 더 많이 벌고 있다는 뜻 → 증액 후보, 반대면 축소 후보.
import type { MediaEfficiency } from "./analysis";

const SPEND = "#A7ACB4"; // ink-faint — 기준(예산)
const REVENUE = "#4F46E5"; // signal — 강조(매출)

export function BudgetShareChart({
  rows,
  highlight,
  onHighlight,
  noun = "매체",
}: {
  rows: MediaEfficiency[];
  highlight: string | null;
  onHighlight: (key: string | null) => void;
  noun?: string;
}) {
  const withRevenue = rows.filter((r) => r.series.current.cost > 0 || r.series.current.revenue > 0);
  if (withRevenue.length < 2) {
    return <p className="py-10 text-center text-[15px] text-ink-muted">비교할 {noun} 2개 이상이 있어야 예산과 매출 기여를 비교해요.</p>;
  }
  const max = Math.max(0.0001, ...withRevenue.flatMap((r) => [r.spendShare, r.revenueShare]));
  const sorted = [...withRevenue].sort((a, b) => b.spendShare - a.spendShare);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-5 text-[15px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm" style={{ background: SPEND }} aria-hidden />
          예산 비중
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-sm" style={{ background: REVENUE }} aria-hidden />
          매출 기여
        </span>
      </div>
      <ul className="space-y-5">
        {sorted.map((r) => {
          const gap = r.revenueShare - r.spendShare;
          const big = Math.abs(gap) >= 0.05;
          const dim = highlight != null && highlight !== r.series.key;
          return (
            <li
              key={r.series.key}
              onMouseEnter={() => onHighlight(r.series.key)}
              onMouseLeave={() => onHighlight(null)}
              className={`grid grid-cols-[minmax(96px,160px)_1fr_76px] items-center gap-4 transition-opacity ${dim ? "opacity-40" : ""}`}
              title={`${r.series.label} — 예산 ${(r.spendShare * 100).toFixed(1)}% · 매출 ${(r.revenueShare * 100).toFixed(1)}%`}
            >
              <span className="flex items-center gap-2 truncate text-[15px] font-semibold text-[#1A1A1A]">
                {r.series.color && <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: r.series.color }} aria-hidden />}
                <span className="truncate">{r.series.label}</span>
              </span>
              <div className="space-y-1">
                {[
                  { v: r.spendShare, c: SPEND, label: "예산" },
                  { v: r.revenueShare, c: REVENUE, label: "매출" },
                ].map((b) => (
                  <div key={b.label} className="flex items-center gap-2">
                    <div className="h-3 flex-1">
                      <div
                        className="h-full rounded-r-[4px]"
                        style={{ width: `${Math.max(b.v > 0 ? 1 : 0, (b.v / max) * 100)}%`, background: b.c }}
                      />
                    </div>
                    <span className="w-11 text-right text-[15px] font-medium tabular-nums text-ink-soft">{(b.v * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
              <span
                className={`flex items-center justify-end gap-0.5 whitespace-nowrap text-[15px] font-semibold tabular-nums ${
                  !big ? "text-ink-muted" : gap > 0 ? "text-good" : "text-bad"
                }`}
              >
                <span aria-hidden>{!big ? "=" : gap > 0 ? "↗" : "↘"}</span>
                {gap > 0 ? "+" : ""}
                {(gap * 100).toFixed(0)}%p
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 text-[13px] leading-relaxed text-ink-muted">
        매출 기여가 예산 비중보다 크면(<span className="text-good">+</span>) 같은 돈으로 더 많이 벌고 있다는 뜻이에요.{noun === "매체" && " 매체마다 전환 기준(기여 기간·조회 전환)이 달라 매출이 겹칠 수 있어요."}
      </p>
    </div>
  );
}
