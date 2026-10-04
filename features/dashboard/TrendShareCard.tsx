"use client";

// 추이 × 예산 비중(2026-10-04) — 좌: 매체별 일별 추이 선(ROAS·매출·광고비 전환), 우: 고른 날짜(기본 = 전체 기간)의 예산 비중 vs 매출 기여.
// 선 그래프의 날짜를 누르면 우측이 그날 기준으로 바뀐다. 이중 축 없음(ctch-dataviz), 매체 색 고정.
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { mergeDaily, type MediaEfficiency, type MediaSeries } from "./analysis";
import { BudgetShareChart } from "./BudgetShareChart";
import { Segmented } from "./ui";

type Metric = "roas" | "revenue" | "cost";
const AXIS = { fontSize: 13, fill: "#4A4F58", fontWeight: 500 };
const GRID = "#EEEEEA";
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const dayLabel = (d: string) => {
  const x = new Date(`${d}T00:00:00`);
  return `${x.getMonth() + 1}.${x.getDate()}`;
};
const dayLong = (d: string) => {
  const x = new Date(`${d}T00:00:00`);
  return `${x.getMonth() + 1}월 ${x.getDate()}일 (${WD[x.getDay()]})`;
};
const wonShort = (v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString("ko-KR")}만` : `${Math.round(v)}`);
const FMT: Record<Metric, (v: number) => string> = {
  roas: (v) => `${Math.round(v * 100).toLocaleString("ko-KR")}%`,
  revenue: (v) => `₩${Math.round(v).toLocaleString("ko-KR")}`,
  cost: (v) => `₩${Math.round(v).toLocaleString("ko-KR")}`,
};

export function TrendShareCard({ series, rows, highlight, onHighlight }: { series: MediaSeries[]; rows: MediaEfficiency[]; highlight: string | null; onHighlight: (k: string | null) => void }) {
  const [metric, setMetric] = useState<Metric>("roas");
  const [day, setDay] = useState<string | null>(null);
  const data = useMemo(
    () => mergeDaily(series, (d) => (metric === "roas" ? (d.cost > 0 ? d.revenue / d.cost : (null as unknown as number)) : metric === "revenue" ? d.revenue : d.cost)),
    [series, metric],
  );
  const dates = data.map((r) => String(r.date));

  // 고른 날짜의 매체별 예산·매출 비중 → BudgetShareChart 입력 모양으로
  const dayRows = useMemo(() => {
    if (!day) return rows;
    const pts = series.map((s) => ({ s, p: s.daily.find((d) => d.date === day) }));
    const cost = pts.reduce((a, x) => a + (x.p?.cost ?? 0), 0);
    const rev = pts.reduce((a, x) => a + (x.p?.revenue ?? 0), 0);
    return pts.map(({ s, p }) => ({
      series: { ...s, current: { ...s.current, cost: p?.cost ?? 0, revenue: p?.revenue ?? 0 } },
      spendShare: cost > 0 ? (p?.cost ?? 0) / cost : 0,
      revenueShare: rev > 0 ? (p?.revenue ?? 0) / rev : 0,
    })) as unknown as MediaEfficiency[];
  }, [day, rows, series]);

  const Tip = ({ active, payload, label }: TooltipContentProps<ValueType, NameType>) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="min-w-[180px] rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] shadow-[0_4px_16px_rgba(21,24,30,0.08)]">
        <p className="mb-1.5 font-medium text-ink">{dayLong(String(label))}</p>
        <ul className="space-y-1">
          {series.map((s) => {
            const v = payload.find((p) => p.dataKey === s.key)?.value as number | undefined;
            return v == null ? null : (
              <li key={s.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-ink-soft">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
                  {s.label}
                </span>
                <span className="tabular-nums text-ink">{FMT[metric](v)}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-1.5 border-t border-line pt-1.5 text-[12px] text-ink-muted">누르면 오른쪽이 이 날짜 기준으로 바뀌어요</p>
      </div>
    );
  };

  if (dates.length < 2) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <p className="flex items-center justify-center rounded-lg bg-canvas py-10 text-[15px] text-ink-muted">일별 추이는 최근 7일·30일에서 볼 수 있어요.</p>
        <BudgetShareChart rows={rows} highlight={highlight} onHighlight={onHighlight} />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-[#1A1A1A]">매체별 일별 추이</p>
          <Segmented value={metric} options={[{ key: "roas", label: "ROAS" }, { key: "revenue", label: "매출" }, { key: "cost", label: "광고비" }]} onChange={setMetric} />
        </div>
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              onClick={(st) => {
                const i = Number(st?.activeTooltipIndex);
                if (Number.isFinite(i) && dates[i]) setDay(dates[i] === day ? null : dates[i]);
              }}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS} tickLine={false} axisLine={{ stroke: "#D9D9D4" }} minTickGap={12} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={metric === "roas" ? (v) => `${Math.round(v * 100)}%` : wonShort} width={58} />
              <Tooltip content={Tip} cursor={{ stroke: "#A7ACB4", strokeWidth: 1 }} />
              {day && <ReferenceLine x={day} stroke="#4F46E5" strokeWidth={1.5} />}
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeOpacity={highlight && highlight !== s.key ? 0.2 : 1}
                  dot={false}
                  activeDot={{ r: 4, stroke: "#FFFFFF", strokeWidth: 2 }}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s) => (
            <button key={s.key} type="button" onMouseEnter={() => onHighlight(s.key)} onMouseLeave={() => onHighlight(null)} className={`flex items-center gap-1.5 text-[13px] ${highlight && highlight !== s.key ? "opacity-40" : "text-ink-soft"}`}>
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-w-0 rounded-lg border border-line p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-[#1A1A1A]">예산 비중 vs 매출 기여 · {day ? dayLong(day) : "전체 기간"}</p>
          {day ? (
            <button type="button" onClick={() => setDay(null)} className="text-[13px] text-signal hover:underline">
              전체 기간으로
            </button>
          ) : (
            <span className="text-[12px] text-ink-muted">왼쪽 그래프에서 날짜를 누르면 그날 기준</span>
          )}
        </div>
        <BudgetShareChart rows={dayRows} highlight={highlight} onHighlight={onHighlight} />
      </div>
    </div>
  );
}
