"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MetricSeries } from "@/lib/google-sheets/parseDeptSummary";

function fmtWon(n: number): string {
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

export function DeptSummaryChart({ metrics }: { metrics: MetricSeries[] }) {
  const find = (name: string) => metrics.find((m) => m.metric === name);
  const 취급고 = find("취급고");
  const 순매출 = find("순매출");
  const 영업이익 = find("영업이익");

  if (!취급고) return null;

  const data = 취급고.values.map((v, i) => ({
    month: v.month.replace(/^\d+년\s*/, ""),
    취급고: v.value,
    순매출: 순매출?.values[i]?.value ?? 0,
    영업이익: 영업이익?.values[i]?.value ?? 0,
  }));

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#E6E6E2" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#767C86" }} tickLine={false} axisLine={{ stroke: "#E6E6E2" }} />
          <YAxis
            tick={{ fontSize: 11, fill: "#767C86" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (Math.abs(v) >= 10000 ? `${Math.round(v / 10000)}만` : String(v))}
          />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: "1px solid #E6E6E2", fontSize: 12, fontFamily: "Pretendard, sans-serif" }}
            formatter={(value, name) => [fmtWon(Number(value)), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="취급고" fill="#C7CBF5" radius={[3, 3, 0, 0]} />
          <Line type="monotone" dataKey="순매출" stroke="#16a34a" strokeWidth={2} dot={{ r: 2.5 }} />
          <Line type="monotone" dataKey="영업이익" stroke="#DC2626" strokeWidth={2} dot={{ r: 2.5 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
