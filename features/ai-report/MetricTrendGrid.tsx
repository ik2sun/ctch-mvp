"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { fmt } from "./calcMetrics";
import type { DailyPoint } from "./metaTypes";

type Metric = {
  key: string;
  label: string;
  color: string;
  pick: (d: DailyPoint) => number;
  kind: "won" | "int" | "x";
};

const METRICS: Metric[] = [
  { key: "cost", label: "광고비", color: "#2a78d6", pick: (d) => d.cost, kind: "won" },
  { key: "conversions", label: "전환수", color: "#eb6834", pick: (d) => d.conversions, kind: "int" },
  { key: "revenue", label: "전환매출", color: "#1baf7a", pick: (d) => d.revenue, kind: "won" },
  { key: "roas", label: "ROAS", color: "#4a3aa7", pick: (d) => (d.cost ? d.revenue / d.cost : 0), kind: "x" },
];

export function MetricTrendGrid({ daily }: { daily: DailyPoint[] }) {
  if (!daily || daily.length < 2) return null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {METRICS.map((m) => {
        const data = daily.map((d) => ({ date: d.date.slice(5), value: m.pick(d) }));
        const last = data[data.length - 1]?.value ?? 0;
        return (
          <div key={m.key} className="rounded-card border border-line bg-surface p-3.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: m.color }} aria-hidden />
              <span className="text-[12px] text-ink-muted">{m.label}</span>
            </div>
            <p className="mt-0.5 font-display text-[17px] font-semibold text-ink">{fmt(last, m.kind)}</p>
            <div className="mt-1.5 h-[64px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
                  <defs>
                    <linearGradient id={`grad-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={m.color} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={m.color} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #E6E6E2",
                      fontSize: 12,
                      fontFamily: "Pretendard, sans-serif",
                    }}
                    labelStyle={{ color: "#767C86" }}
                    formatter={(value) => [fmt(Number(value), m.kind), m.label]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={m.color}
                    strokeWidth={2}
                    fill={`url(#grad-${m.key})`}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
