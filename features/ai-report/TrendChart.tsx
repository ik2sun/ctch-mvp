"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyPoint } from "./metaTypes";

export function TrendChart({ daily }: { daily: DailyPoint[] }) {
  if (!daily || daily.length < 2) return null;

  const data = daily.map((d) => ({
    date: d.date.slice(5), // MM-DD
    광고비: Math.round(d.cost),
    ROAS: d.cost ? Math.round((d.revenue / d.cost) * 100) : 0,
    CPA: d.conversions ? Math.round(d.cost / d.conversions) : 0,
  }));

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#E6E6E2" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#767C86" }} tickLine={false} axisLine={{ stroke: "#E6E6E2" }} />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 11, fill: "#767C86" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (v >= 10000 ? `${Math.round(v / 10000)}만` : String(v))}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 11, fill: "#767C86" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #E6E6E2",
              fontSize: 12,
              fontFamily: "Pretendard, sans-serif",
            }}
            formatter={(value: number, name: string) =>
              name === "ROAS" ? [`${value}%`, name] : [`₩${value.toLocaleString("ko-KR")}`, name]
            }
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="left" dataKey="광고비" fill="#C7CBF5" radius={[3, 3, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="ROAS" stroke="#4F46E5" strokeWidth={2} dot={{ r: 2.5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
