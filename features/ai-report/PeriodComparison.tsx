"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "./calcMetrics";
import { DEFAULT_COMPARE_METRICS, METRIC_CATALOG, hasData, metricValue, type CompareMetricKey } from "./metricCatalog";
import type { Totals } from "./metaTypes";

const PREV_COLOR = "#94A3B8";
const CUR_COLOR = "#3B82F6";
const UP_BG = "#16A34A";
const DOWN_BG = "#DC2626";

const CUR_COLOR_BY_METRIC: Partial<Record<CompareMetricKey, string>> = {
  cost: "#3B82F6",
  conversions: "#10B981",
  revenue: "#F59E0B",
  roas: "#8B5CF6",
};
function curColorFor(key: CompareMetricKey): string {
  return CUR_COLOR_BY_METRIC[key] ?? CUR_COLOR;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function fmtDate(dateStr: string, withWeekday: boolean): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const s = `${d.getMonth() + 1}.${d.getDate()}`;
  return withWeekday ? `${s}${WEEKDAY_KO[d.getDay()]}` : s;
}

function fmtRange(range: { since: string; until: string }, withWeekday: boolean): string {
  return `${fmtDate(range.since, withWeekday)} ~ ${fmtDate(range.until, withWeekday)}`;
}

function fmtShortRange(range: { since: string; until: string } | undefined): string {
  if (!range) return "";
  return `${fmtDate(range.since, false)}~${fmtDate(range.until, false)}`;
}

function PeriodTick(prevSub: string, curSub: string) {
  return function Tick(props: Record<string, unknown>) {
    const x = Number(props.x ?? 0);
    const y = Number(props.y ?? 0);
    const payload = props.payload as { value?: string } | undefined;
    const isCur = payload?.value === "최근";
    const sub = isCur ? curSub : prevSub;
    return (
      <g transform={`translate(${x},${y})`}>
        <text x={0} y={0} dy={12} textAnchor="middle" fontSize={11} fill="#767C86">
          {payload?.value}
        </text>
        {sub && (
          <text x={0} y={0} dy={26} textAnchor="middle" fontSize={10} fill="#A7ACB4">
            ({sub})
          </text>
        )}
      </g>
    );
  };
}

function delta(cur: number, prev: number): number | null {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

function DeltaPill({ value }: { value: number | null }) {
  if (value === null || !isFinite(value)) {
    return <span className="rounded-full bg-ink-faint/40 px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted">--</span>;
  }
  const up = value >= 0;
  return (
    <span
      className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white"
      style={{ background: up ? UP_BG : DOWN_BG }}
    >
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

type Period = { since: string; until: string };

export type Compare = { current: Totals; previous: Totals; period?: Period; prevPeriod?: Period };

const PERIOD_OPTIONS: { value: number; label: string; withWeekday: boolean }[] = [
  { value: 7, label: "전주 비교", withWeekday: true },
  { value: 14, label: "2주 비교", withWeekday: true },
  { value: 30, label: "전월 비교", withWeekday: false },
  { value: 60, label: "2개월 비교", withWeekday: false },
  { value: 90, label: "3개월 비교", withWeekday: false },
];

function MetricCard({
  metricKey,
  data,
}: {
  metricKey: CompareMetricKey;
  data: { current: Totals; previous: Totals };
}) {
  const meta = METRIC_CATALOG[metricKey];
  const curOk = hasData(data.current);
  const prevOk = hasData(data.previous);
  const curVal = curOk ? metricValue(data.current, metricKey) : null;
  const prevVal = prevOk ? metricValue(data.previous, metricKey) : null;
  const change = curOk && prevOk ? delta(curVal!, prevVal!) : null;

  return (
    <div className="rounded-card border border-line bg-white p-3.5">
      <p className="text-[12px] font-medium text-[#6B7280]">{meta.label}</p>

      <div className="mt-2">
        <p className="text-[10px] text-ink-faint">이전</p>
        <p className="text-[14px] text-[#6B7280]">{prevOk ? fmt(prevVal, meta.kind) : "데이터 없음"}</p>
      </div>

      <div className="mt-1.5">
        <p className="text-[10px] text-ink-faint">최근</p>
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-bold text-[#111827]">{curOk ? fmt(curVal, meta.kind) : "데이터 없음"}</span>
          <DeltaPill value={change} />
        </div>
      </div>
    </div>
  );
}

function MetricBarBox({
  metricKey,
  data,
  period,
  prevPeriod,
}: {
  metricKey: CompareMetricKey;
  data: { current: Totals; previous: Totals };
  period?: Period;
  prevPeriod?: Period;
}) {
  const meta = METRIC_CATALOG[metricKey];
  const curOk = hasData(data.current);
  const prevOk = hasData(data.previous);
  const curColor = curColorFor(metricKey);
  const chartData = [
    { period: "이전", value: prevOk ? metricValue(data.previous, metricKey) : 0, ok: prevOk },
    { period: "최근", value: curOk ? metricValue(data.current, metricKey) : 0, ok: curOk },
  ];
  const prevSub = fmtShortRange(prevPeriod);
  const curSub = fmtShortRange(period);
  const tick = PeriodTick(prevSub, curSub);

  return (
    <div className="rounded-card border border-line bg-white p-4">
      <p className="mb-2 text-[13px] font-medium text-ink-soft">{meta.label}</p>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
            <CartesianGrid stroke="#E6E6E2" vertical={false} />
            <XAxis dataKey="period" tick={tick} height={38} tickLine={false} axisLine={{ stroke: "#E6E6E2" }} />
            <YAxis
              tick={{ fontSize: 11, fill: "#767C86" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => Number(v).toLocaleString("ko-KR")}
            />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: `1px solid ${curColor}`, background: "#fff", fontSize: 12, fontFamily: "Pretendard, sans-serif" }}
              formatter={(value, _name, item) => [
                item?.payload?.ok ? fmt(Number(value), meta.kind) : "데이터 없음",
                meta.label,
              ]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={22}>
              {chartData.map((d) => (
                <Cell key={d.period} fill={d.period === "이전" ? PREV_COLOR : curColor} fillOpacity={d.ok ? 1 : 0.15} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PeriodComparison({
  window,
  onWindowChange,
  data,
  loading,
}: {
  window: number;
  onWindowChange: (n: number) => void;
  data: Compare | null;
  loading: boolean;
}) {
  const [metricKeys, setMetricKeys] = useState<CompareMetricKey[]>(DEFAULT_COMPARE_METRICS);

  function setSlot(i: number, key: CompareMetricKey) {
    setMetricKeys((prev) => prev.map((k, idx) => (idx === i ? key : k)));
  }

  const option = PERIOD_OPTIONS.find((o) => o.value === window) ?? PERIOD_OPTIONS[0];
  const hasRange = !!(data?.period && data?.prevPeriod);
  const curRange = hasRange ? fmtRange(data!.period!, option.withWeekday) : null;
  const prevRange = hasRange ? fmtRange(data!.prevPeriod!, option.withWeekday) : null;

  return (
    <div className="space-y-5">
      {/* 기간 선택 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink-soft">
          {option.label}
          {!loading && hasRange && (
            <span className="ml-1.5 font-mono text-[11px] font-normal text-ink-muted">
              ({curRange} vs {prevRange})
            </span>
          )}
        </span>
        <select
          value={window}
          onChange={(e) => onWindowChange(Number(e.target.value))}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink-soft outline-none transition hover:border-ink-faint focus:border-signal"
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* 지표 선택 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: PREV_COLOR }} aria-hidden />
          <span className="text-[11px] text-ink-muted">이전</span>
        </div>
        <div className="mr-2 flex items-center gap-1.5">
          <span className="text-[11px] text-ink-muted">최근 (지표별 색상)</span>
        </div>
        {metricKeys.map((key, i) => (
          <select
            key={i}
            value={key}
            onChange={(e) => setSlot(i, e.target.value as CompareMetricKey)}
            className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink-soft outline-none transition hover:border-ink-faint focus:border-signal"
          >
            {(Object.keys(METRIC_CATALOG) as CompareMetricKey[]).map((k) => (
              <option key={k} value={k}>
                {METRIC_CATALOG[k].label}
              </option>
            ))}
          </select>
        ))}
      </div>

      {loading ? (
        <p className="py-6 text-center text-[13px] text-ink-muted">불러오는 중…</p>
      ) : !data ? (
        <p className="py-6 text-center text-[13px] text-ink-muted">데이터 없음</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metricKeys.map((key) => (
              <MetricCard key={key} metricKey={key} data={{ current: data.current, previous: data.previous }} />
            ))}
          </div>

          <div>
            <p className="mb-2 text-[12px] text-ink-muted">지표별 비교 그래프</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {metricKeys.map((key) => (
                <MetricBarBox
                  key={key}
                  metricKey={key}
                  data={{ current: data.current, previous: data.previous }}
                  period={data.period}
                  prevPeriod={data.prevPeriod}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
