"use client";

// 일별 추이 — 광고비(매체별 누적 막대)와 ROAS(매체별 선)를 따로 그린다(이중 축 금지).
// 매체 색은 MEDIA_COLORS 고정, 표·막대에서 매체를 가리키면(highlight) 나머지는 흐려진다.
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { mergeDaily, type MediaSeries } from "./analysis";

const AXIS = { fontSize: 13, fill: "#4A4F58", fontWeight: 500 };
const GRID = "#EEEEEA";
const WD = ["일", "월", "화", "수", "목", "금", "토"];

function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}.${d.getDate()}`;
}
function dayLabelLong(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
}
const wonShort = (v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString("ko-KR")}만` : `${Math.round(v)}`);

function makeTooltip(series: MediaSeries[], format: (v: number) => string, withTotal: boolean) {
  return function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
    if (!active || !payload?.length) return null;
    const items = series
      .map((s) => ({ s, v: payload.find((p) => p.dataKey === s.key)?.value as number | undefined }))
      .filter((x) => x.v != null);
    const total = items.reduce((a, x) => a + (x.v ?? 0), 0);
    return (
      <div className="min-w-[180px] rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] shadow-[0_4px_16px_rgba(21,24,30,0.08)]">
        <p className="mb-1.5 font-medium text-ink">{dayLabelLong(String(label))}</p>
        <ul className="space-y-1">
          {items.map(({ s, v }) => (
            <li key={s.key} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-ink-soft">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
                {s.label}
              </span>
              <span className="tabular-nums text-ink">{format(v!)}</span>
            </li>
          ))}
        </ul>
        {withTotal && items.length > 1 && (
          <p className="mt-1.5 flex justify-between border-t border-line pt-1.5 font-medium text-ink">
            <span>합계</span>
            <span className="tabular-nums">{format(total)}</span>
          </p>
        )}
      </div>
    );
  };
}

export function MediaLegend({ series, highlight, onHighlight }: { series: MediaSeries[]; highlight: string | null; onHighlight: (k: string | null) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {series.map((s) => (
        <button
          key={s.key}
          type="button"
          onMouseEnter={() => onHighlight(s.key)}
          onMouseLeave={() => onHighlight(null)}
          onFocus={() => onHighlight(s.key)}
          onBlur={() => onHighlight(null)}
          className={`flex items-center gap-1.5 text-[13px] transition-opacity ${highlight && highlight !== s.key ? "opacity-40" : "text-ink-soft"}`}
        >
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function DailySpendChart({ series, highlight }: { series: MediaSeries[]; highlight: string | null }) {
  const data = mergeDaily(series, (d) => d.cost);
  const Tip = makeTooltip(series, (v) => `₩${Math.round(v).toLocaleString("ko-KR")}`, true);
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS} tickLine={false} axisLine={{ stroke: "#D9D9D4" }} minTickGap={12} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={wonShort} width={60} />
          <Tooltip content={Tip} cursor={{ fill: "rgba(21,24,30,0.04)" }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="cost"
              fill={s.color}
              stroke="#FFFFFF"
              strokeWidth={1}
              fillOpacity={highlight && highlight !== s.key ? 0.25 : 1}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DailyRoasChart({ series, highlight }: { series: MediaSeries[]; highlight: string | null }) {
  const data = mergeDaily(series, (d) => (d.cost > 0 ? d.revenue / d.cost : (null as unknown as number)));
  const Tip = makeTooltip(series, (v) => `${Math.round(v * 100).toLocaleString("ko-KR")}%`, false);
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="date" tickFormatter={dayLabel} tick={AXIS} tickLine={false} axisLine={{ stroke: "#D9D9D4" }} minTickGap={12} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={56} />
          <Tooltip content={Tip} cursor={{ stroke: "#A7ACB4", strokeWidth: 1 }} />
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
  );
}
