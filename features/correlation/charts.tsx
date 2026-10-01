"use client";

// 상관관계 차트 — 일별 추이(원인 누적 막대 / 결과 선, 두 차트로 분리·같은 x축), 시차 상관 막대, 상관 매트릭스
// 이중 축 금지(ctch-dataviz). 원인 색은 ROLE_META 4색, 결과는 ink 단색.
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { LagResult, Series } from "./analysis";

const AXIS = { fontSize: 13, fontWeight: 500, fill: "#4A4F58" };
const GRID = "#EEEEEA";

export function fmtValue(v: number | null | undefined, unit: Series["unit"], noun = ""): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (unit === "ratio") return `${Math.round(v * 100).toLocaleString("ko-KR")}%`;
  if (unit === "won") return v >= 1e8 ? `${(v / 1e8).toFixed(2)}억 원` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString("ko-KR")}만 원` : `${Math.round(v).toLocaleString("ko-KR")}원`;
  if (unit === "count") return `${Math.abs(v) >= 100 ? Math.round(v).toLocaleString("ko-KR") : v.toFixed(1)}${noun}`;
  return v.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}
function axisFmt(unit: Series["unit"]) {
  return (v: number) =>
    unit === "ratio" ? `${Math.round(v * 100)}%` : unit === "won" ? (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v >= 1e4 ? `${Math.round(v / 1e4)}만` : `${Math.round(v)}`) : v >= 1e4 ? `${Math.round(v / 1e3)}k` : `${Math.round(v)}`;
}
const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))}`;

function rolling7(v: (number | null)[]): (number | null)[] {
  return v.map((_, i) => {
    const w = v.slice(Math.max(0, i - 6), i + 1).filter((x): x is number => x != null && Number.isFinite(x));
    return w.length >= 4 ? w.reduce((s, x) => s + x, 0) / w.length : null;
  });
}

// ── 일별 추이: 위 원인(누적 막대), 아래 결과(선 + 7일 평균) ─────────
export function TimelineCharts({ dates, drivers, outcome, highlight }: { dates: string[]; drivers: Series[]; outcome: Series; highlight: string | null }) {
  const avg = rolling7(outcome.values);
  const data = dates.map((d, i) => {
    const row: Record<string, number | string | null> = { date: d, y: outcome.values[i], avg: avg[i] };
    for (const s of drivers) row[s.key] = s.values[i] ?? 0;
    return row;
  });
  const driverUnit = drivers[0]?.unit ?? "won";

  function Tip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
    if (!active || !payload?.length) return null;
    const row = data.find((r) => r.date === label);
    if (!row) return null;
    return (
      <div className="min-w-[200px] rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] shadow-[0_4px_16px_rgba(21,24,30,0.08)]">
        <p className="mb-1.5 font-medium text-ink">{String(label)}</p>
        <ul className="space-y-1">
          {drivers.map((s) => (
            <li key={s.key} className="flex justify-between gap-4">
              <span className="flex items-center gap-1.5 text-ink-soft">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                {s.label}
              </span>
              <span className="tabular-nums text-ink">{fmtValue(row[s.key] as number, s.unit)}</span>
            </li>
          ))}
          <li className="mt-1 flex justify-between gap-4 border-t border-line pt-1 font-medium">
            <span className="text-ink-soft">{outcome.label}</span>
            <span className="tabular-nums text-ink">{fmtValue(row.y as number | null, outcome.unit, outcome.noun)}</span>
          </li>
        </ul>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1 text-[13px] font-medium text-ink-soft">원인 · 상위 퍼널 캠페인</p>
      <div className="h-[150px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} syncId="corr" margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap="12%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tickFormatter={md} tick={AXIS} tickLine={false} axisLine={{ stroke: "#D9D9D4" }} minTickGap={24} hide />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={axisFmt(driverUnit)} width={48} />
            <Tooltip content={Tip} cursor={{ fill: "rgba(21,24,30,0.04)" }} />
            {drivers.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                stackId="d"
                fill={s.color}
                stroke="#FFFFFF"
                strokeWidth={1}
                fillOpacity={highlight && highlight !== s.key ? 0.2 : 1}
                radius={i === drivers.length - 1 ? [3, 3, 0, 0] : 0}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mb-1 mt-3 text-[13px] font-medium text-ink-soft">
        결과 · {outcome.label} <span className="font-normal text-ink-muted">(옅은 선 = 일별, 진한 선 = 7일 평균)</span>
      </p>
      <div className="h-[170px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} syncId="corr" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tickFormatter={md} tick={AXIS} tickLine={false} axisLine={{ stroke: "#D9D9D4" }} minTickGap={24} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={axisFmt(outcome.unit)} width={48} />
            <Tooltip content={Tip} cursor={{ stroke: "#A7ACB4", strokeWidth: 1 }} />
            <Line dataKey="y" stroke="#A7ACB4" strokeWidth={1.5} dot={false} connectNulls isAnimationActive={false} />
            <Line dataKey="avg" stroke="#15181E" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── 시차 상관: 원인 n일 뒤 결과와의 상관(요일·추세 제거 후) ─────────
export function LagChart({ result, color }: { result: LagResult; color: string }) {
  const data = result.profile.map((p) => ({ lag: p.lag, r: p.r }));
  function Tip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload as { lag: number; r: number | null };
    return (
      <div className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] shadow-[0_4px_16px_rgba(21,24,30,0.08)]">
        <p className="font-medium text-ink">{p.lag === 0 ? "같은 날" : `${p.lag}일 뒤`}</p>
        <p className="tabular-nums text-ink-soft">상관 r = {p.r == null ? "—" : p.r.toFixed(2)}</p>
      </div>
    );
  }
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="18%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="lag" tick={AXIS} tickLine={false} axisLine={{ stroke: "#D9D9D4" }} tickFormatter={(v) => (v === 0 ? "당일" : `${v}일`)} interval={1} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} domain={[-1, 1]} ticks={[-1, -0.5, 0, 0.5, 1]} width={36} />
          <Tooltip content={Tip} cursor={{ fill: "rgba(21,24,30,0.04)" }} />
          <ReferenceLine y={0} stroke="#D9D9D4" />
          <ReferenceLine y={result.rCrit} stroke="#A7ACB4" strokeDasharray="0" label={{ value: "유의 경계", position: "insideTopRight", fontSize: 13, fill: "#767C86" }} />
          <ReferenceLine y={-result.rCrit} stroke="#A7ACB4" />
          <Bar dataKey="r" radius={[3, 3, 3, 3]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.lag} fill={color} fillOpacity={d.lag === result.lag ? 1 : 0.3} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 상관 매트릭스: 원인(행) × 결과(열), 칸 = 가장 강한 시차의 r ─────────
// 발산 색: 양(+) 인디고, 음(−) 갈색 — 진하기 = |r|. 값과 시차를 글자로 함께 쓴다(색만으로 전달 금지).
export function Heatmap({
  drivers,
  outcomes,
  cells,
  selected,
  onSelect,
}: {
  drivers: Series[];
  outcomes: Series[];
  cells: Record<string, LagResult>;
  selected: { driver: string; outcome: string };
  onSelect: (driver: string, outcome: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-separate border-spacing-[3px] text-[13px]">
        <thead>
          <tr>
            <th className="w-[140px]" />
            {outcomes.map((o) => (
              <th key={o.key} className="px-1 pb-1 text-left align-bottom text-[12px] font-medium leading-tight text-ink-muted">
                {o.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.key}>
              <th className="pr-2 text-left font-medium text-ink-soft">
                <span className="flex items-center gap-1.5">
                  {d.color ? <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: d.color }} aria-hidden /> : <i className="ti ti-file-import text-[13px] text-ink-muted" aria-hidden />}
                  {d.label}
                </span>
              </th>
              {outcomes.map((o) => {
                const c = cells[`${d.key}|${o.key}`];
                const r = c?.r ?? null;
                const sig = c && (c.strength === "strong" || c.strength === "moderate");
                // 유의한 칸만 |r|만큼 진하게, 나머지는 옅게(우연일 수 있는 큰 r이 강해 보이지 않게)
                const alpha = r == null ? 0 : sig ? 0.18 + Math.abs(r) * 0.62 : 0.05 + Math.abs(r) * 0.12;
                const bg = r == null ? "#F6F6F4" : r >= 0 ? `rgba(79,70,229,${alpha})` : `rgba(180,105,14,${alpha})`;
                const dark = alpha > 0.45;
                const isSel = selected.driver === d.key && selected.outcome === o.key;
                return (
                  <td key={o.key} className="p-0">
                    <button
                      type="button"
                      onClick={() => onSelect(d.key, o.key)}
                      aria-pressed={isSel}
                      title={c ? `${d.label} → ${o.label}: r=${r?.toFixed(2) ?? "—"}, ${c.lag}일 뒤, ${sig ? "유의" : "유의하지 않음"}` : ""}
                      className={`flex h-[52px] w-full flex-col items-center justify-center rounded-md transition ${isSel ? "ring-2 ring-ink ring-offset-1" : "hover:ring-1 hover:ring-ink/30"}`}
                      style={{ background: bg }}
                    >
                      <span className={`font-mono text-[15px] font-semibold tabular-nums ${dark ? "text-white" : "text-ink"}`}>
                        {r == null ? "—" : `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(2)}`}
                        {sig && <span aria-label="유의">*</span>}
                      </span>
                      {c && r != null && <span className={`text-[12px] ${dark ? "text-white/85" : "text-ink-muted"}`}>{c.lag === 0 ? "당일" : `${c.lag}일 뒤`}</span>}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
