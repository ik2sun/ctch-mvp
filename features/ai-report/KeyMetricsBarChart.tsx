"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmt } from "./calcMetrics";
import { hasData } from "./metricCatalog";
import type { Totals } from "./metaTypes";

const METRICS = [
  { key: "impressions", label: "노출", color: "#2a78d6", kind: "int" as const },
  { key: "clicks", label: "클릭", color: "#008300", kind: "int" as const },
  { key: "conversions", label: "전환", color: "#eb6834", kind: "int" as const },
  { key: "cost", label: "비용", color: "#4a3aa7", kind: "won" as const },
];

export function KeyMetricsBarChart({ totals }: { totals: Totals | null }) {
  if (!totals || !hasData(totals)) {
    return (
      <div className="flex h-[220px] items-center justify-center text-[13px] text-ink-muted">
        데이터 없음
      </div>
    );
  }

  const data = METRICS.map((m) => ({
    metric: m.label,
    value: totals[m.key as "impressions" | "clicks" | "conversions" | "cost"],
    color: m.color,
    kind: m.kind,
  }));

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#E6E6E2" vertical={false} />
          <XAxis dataKey="metric" tick={{ fontSize: 12, fill: "#767C86" }} tickLine={false} axisLine={{ stroke: "#E6E6E2" }} />
          <YAxis hide />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid #E6E6E2", fontSize: 12, fontFamily: "Pretendard, sans-serif" }}
            formatter={(value, _name, item) => [fmt(Number(value), item?.payload?.kind ?? "int"), item?.payload?.metric]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.metric} fill={d.color} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              content={(props) => {
                const { x, y, width, value, index } = props as { x: number; width: number; y: number; value: number; index: number };
                const kind = data[index ?? 0]?.kind ?? "int";
                return (
                  <text x={Number(x) + Number(width) / 2} y={Number(y) - 6} textAnchor="middle" fontSize={11} fill="#3B4048">
                    {fmt(Number(value), kind)}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
