"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TeamSeries } from "@/lib/google-sheets/parseTeamComparison";

function fmtWon(n: number): string {
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

export function TeamComparisonChart({ teams }: { teams: TeamSeries[] }) {
  const months = useMemo(() => teams[0]?.values.map((v) => v.month) ?? [], [teams]);
  const [month, setMonth] = useState(months[months.length - 1] ?? "");
  const activeMonth = months.includes(month) ? month : months[months.length - 1] ?? "";

  const teamNames = useMemo(() => [...new Set(teams.map((t) => t.team))], [teams]);

  const data = teamNames.map((name) => {
    const idx = months.indexOf(activeMonth);
    const cost = teams.find((t) => t.section === "취급고" && t.team === name);
    const net = teams.find((t) => t.section === "순매출" && t.team === name);
    return {
      team: name,
      취급고: cost?.values[idx]?.value ?? 0,
      순매출: net?.values[idx]?.value ?? 0,
    };
  });

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[12px] text-ink-muted">기준 월</span>
        <select
          value={activeMonth}
          onChange={(e) => setMonth(e.target.value)}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-[12px] text-ink-soft outline-none focus:border-signal"
        >
          {months.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#E6E6E2" vertical={false} />
            <XAxis dataKey="team" tick={{ fontSize: 11, fill: "#767C86" }} tickLine={false} axisLine={{ stroke: "#E6E6E2" }} />
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
            <Bar dataKey="취급고" fill="#4a3aa7" radius={[4, 4, 0, 0]} />
            <Bar dataKey="순매출" fill="#16a34a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
