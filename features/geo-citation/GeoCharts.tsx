"use client";

import { Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnswerLite } from "./geoData";
import { API_ENGINES, ENGINE_COLOR, ENGINE_LABEL, isMentioned, type GeoRun } from "./types";

const AXIS = { fontSize: 11, fill: "#767C86" };
const TOOLTIP_STYLE = { borderRadius: 10, border: "1px solid #E6E6E2", fontSize: 12, fontFamily: "Pretendard, sans-serif" };

type Metric = "mention" | "cite";

function trendRows(runs: GeoRun[], stats: AnswerLite[], metric: Metric) {
  return [...runs]
    .filter((r) => r.status !== "running")
    .sort((a, b) => a.started_at.localeCompare(b.started_at))
    .map((r) => {
      const row: Record<string, string | number | null> = {
        date: new Date(r.started_at).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }),
      };
      for (const e of API_ENGINES) {
        const done = stats.filter((s) => s.run_id === r.id && s.engine === e && s.status === "done");
        const hit = metric === "mention" ? done.filter(isMentioned).length : done.filter((s) => s.own_cited).length;
        row[e] = done.length ? Math.round((hit / done.length) * 1000) / 10 : null;
      }
      return row;
    });
}

// 회차별 추이 — 언급률·자사 인용률을 한 축(%)씩 따로 그린다(이중 축 금지)
export function TrendPair({ runs, stats }: { runs: GeoRun[]; stats: AnswerLite[] }) {
  const finished = runs.filter((r) => r.status !== "running");
  if (finished.length < 2) {
    return <p className="rounded-lg bg-canvas px-4 py-6 text-center text-[12px] text-ink-muted">측정이 2회 이상 쌓이면 회차별 추이가 그려져요. (현재 {finished.length}회)</p>;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {(["mention", "cite"] as Metric[]).map((m) => {
        const data = trendRows(runs, stats, m);
        const engines = API_ENGINES.filter((e) => data.some((d) => d[e] !== null));
        return (
          <div key={m}>
            <p className="mb-1 text-[12px] font-medium text-ink-soft">{m === "mention" ? "AI 언급률" : "자사 도메인 인용률"} · 엔진별</p>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 36, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="#E6E6E2" vertical={false} />
                  <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: "#E6E6E2" }} />
                  <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, name) => [v === null ? "-" : `${v}%`, ENGINE_LABEL[name as keyof typeof ENGINE_LABEL] ?? name]} />
                  <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span className="text-ink-soft">{ENGINE_LABEL[v as keyof typeof ENGINE_LABEL] ?? v}</span>} />
                  {engines.map((e) => (
                    <Line key={e} type="monotone" dataKey={e} stroke={ENGINE_COLOR[e]} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "#fff" }} activeDot={{ r: 5 }} connectNulls>
                      <LabelList
                        dataKey={e}
                        content={({ x, y, value, index }) =>
                          index === data.length - 1 && value !== null && value !== undefined ? (
                            <text x={Number(x) + 8} y={Number(y) + 4} fontSize={11} fill="#4B5563">
                              {`${value}%`}
                            </text>
                          ) : null
                        }
                      />
                    </Line>
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// 인용 출처 유형 분포 — 크기 비교라 단일 색 가로 막대
export function SourceTypeBars({ rows }: { rows: { type: string; count: number }[] }) {
  if (rows.length === 0) return <p className="text-[12px] text-ink-muted">인용된 출처가 없어요.</p>;
  const total = rows.reduce((s, r) => s + r.count, 0);
  const data = [...rows].sort((a, b) => b.count - a.count).map((r) => ({ ...r, share: Math.round((r.count / total) * 1000) / 10 }));
  return (
    <div style={{ height: Math.max(140, data.length * 30 + 20) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap={4}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="type"
            width={72}
            tick={({ x, y, payload }) => (
              <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill={payload.value === "자사" ? "#111827" : "#4B5563"} fontWeight={payload.value === "자사" ? 600 : 400}>
                {payload.value}
              </text>
            )}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip cursor={{ fill: "#F6F6F4" }} contentStyle={TOOLTIP_STYLE} formatter={(v, _n, p) => [`${v}건 (${p.payload.share}%)`, "인용"]} />
          <Bar dataKey="count" fill="#4F46E5" radius={[0, 4, 4, 0]} maxBarSize={18}>
            <LabelList dataKey="share" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 11, fill: "#4B5563" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
