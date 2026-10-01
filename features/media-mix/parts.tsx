"use client";

// 미디어믹스 화면 부품 — 금액 표기, 롤링 숫자, 증감 뱃지, AS-IS/TO-BE 비중 막대, 반응 곡선
import { useEffect, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { curvePoints, type MediaModel, type MediaPlanRow, type Objective } from "./model";

// ── 표기 ─────────────────────────────────────────────
export const won = (v: number) => `${Math.round(v).toLocaleString("ko-KR")}원`;
// 1,234만 원 / 1.25억 원 — 만 원 미만은 원 단위
export function man(v: number, signed = false) {
  const sign = signed ? (v > 0 ? "+" : v < 0 ? "−" : "") : v < 0 ? "−" : "";
  const a = Math.abs(v);
  const body =
    a >= 1e8 ? `${(a / 1e8).toFixed(a >= 1e9 ? 1 : 2).replace(/\.?0+$/, "")}억` : a >= 1e4 ? `${Math.round(a / 1e4).toLocaleString("ko-KR")}만` : `${Math.round(a).toLocaleString("ko-KR")}`;
  return `${sign}${body} 원`;
}
export const count = (v: number, signed = false) => `${signed && v > 0 ? "+" : v < 0 ? "−" : ""}${Math.round(Math.abs(v)).toLocaleString("ko-KR")}건`;
export const pct = (v: number | null) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v * 100).toLocaleString("ko-KR")}%`);
const axisMan = (v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString("ko-KR")}만` : `${Math.round(v)}`);

// 고정폭 숫자 + 비례폭 단위 — 고정폭 폰트에서 한글 단위('만 원', '건')가 벌어져 보이지 않게 단위만 본문 글꼴로
export function Amount({ text, unitClass = "font-sans" }: { text: string; unitClass?: string }) {
  return (
    <>
      {text.split(/([+\-−]?[\d,.]+)/).map((part, i) =>
        !part ? null : /^[+\-−]?[\d,.]+$/.test(part) ? (
          <span key={i}>{part}</span>
        ) : (
          <span key={i} className={unitClass}>
            {part}
          </span>
        ),
      )}
    </>
  );
}

// ── 롤링 숫자 — 값이 바뀌면 0.45초 동안 이전 값에서 굴러간다 ─────────
export function RollingNumber({ value, format, className = "", unitClass }: { value: number; format: (v: number) => string; className?: string; unitClass?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (raf.current) cancelAnimationFrame(raf.current);
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 450);
      const e = 1 - Math.pow(1 - p, 3);
      const v = a + (b - a) * e;
      from.current = v;
      setShown(v);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value]);
  return (
    <span className={`tabular-nums ${className}`} aria-live="polite">
      <Amount text={format(shown)} unitClass={unitClass} />
    </span>
  );
}

// ── 증감 뱃지 — 증액 초록(효과 기대), 감액 옅은 회색(비효율 삭감) ─────────
export function BudgetDelta({ delta, step }: { delta: number; step: number }) {
  if (Math.abs(delta) < Math.max(1, step / 2)) {
    return <span className="whitespace-nowrap inline-flex items-center rounded-md bg-canvas px-2 py-0.5 text-[13px] text-ink-muted">유지</span>;
  }
  if (delta > 0) {
    return (
      <span className="whitespace-nowrap inline-flex items-center gap-1 rounded-md border border-good/20 bg-good/10 px-2 py-0.5 font-mono text-[13px] font-semibold text-good" title="증액 — 효과 기대">
        <i className="ti ti-trending-up text-[15px]" aria-hidden />
        <span>
          <Amount text={man(delta, true)} />
        </span>
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-2 py-0.5 font-mono text-[13px] text-ink-muted" title="감액 — 비효율 예산 삭감">
      <i className="ti ti-scissors text-[13px]" aria-hidden />
      <span>
        <Amount text={man(delta, true)} />
      </span>
    </span>
  );
}

// ── AS-IS vs TO-BE 100% 누적 막대 ─────────────────────
export function MixBars({ rows, highlight, onHighlight }: { rows: MediaPlanRow[]; highlight: string | null; onHighlight: (k: string | null) => void }) {
  const asIsTotal = rows.reduce((s, r) => s + r.asIs, 0);
  const toBeTotal = rows.reduce((s, r) => s + r.toBe, 0);
  const bars = [
    { label: "현재 비중", sub: "AS-IS", total: asIsTotal, get: (r: MediaPlanRow) => r.asIs },
    { label: "AI 제안", sub: "TO-BE", total: toBeTotal, get: (r: MediaPlanRow) => r.toBe },
  ];
  return (
    <div className="space-y-3">
      {bars.map((b) => (
        <div key={b.sub} className="grid grid-cols-[64px_1fr] items-center gap-3">
          <div className="leading-tight">
            <p className="text-[13px] font-medium text-ink">{b.label}</p>
            <p className="font-mono text-[12px] text-ink-muted">{b.sub}</p>
          </div>
          <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded-[4px]">
            {rows.map((r) => {
              const v = b.get(r);
              const share = b.total > 0 ? v / b.total : 0;
              if (share <= 0) return null;
              const dim = highlight && highlight !== r.key;
              return (
                <div
                  key={r.key}
                  role="img"
                  aria-label={`${r.label} ${Math.round(share * 100)}% · ${man(v)}`}
                  title={`${r.label} ${Math.round(share * 100)}% · ${man(v)}`}
                  onMouseEnter={() => onHighlight(r.key)}
                  onMouseLeave={() => onHighlight(null)}
                  className="flex min-w-0 items-center justify-center overflow-hidden text-[13px] font-medium text-white transition-[opacity,width] duration-300"
                  style={{ width: `${share * 100}%`, background: r.color, opacity: dim ? 0.25 : 1 }}
                >
                  {share >= 0.1 && <span className="truncate px-1 tabular-nums [text-shadow:0_0_3px_rgba(0,0,0,0.35)]">{Math.round(share * 100)}%</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 pl-[76px]">
        {rows.map((r) => {
          const a = asIsTotal > 0 ? r.asIs / asIsTotal : 0;
          const t = toBeTotal > 0 ? r.toBe / toBeTotal : 0;
          const d = Math.round((t - a) * 100);
          return (
            <button
              key={r.key}
              type="button"
              onMouseEnter={() => onHighlight(r.key)}
              onMouseLeave={() => onHighlight(null)}
              className={`flex items-center gap-1.5 text-[13px] transition-opacity ${highlight && highlight !== r.key ? "opacity-40" : "text-ink-soft"}`}
            >
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: r.color }} aria-hidden />
              {r.label}
              <span className="tabular-nums text-ink-muted">
                {Math.round(a * 100)}% → <b className="font-semibold text-ink">{Math.round(t * 100)}%</b>
                {d !== 0 && <span className={d > 0 ? "text-good" : "text-ink-faint"}> ({d > 0 ? "+" : "−"}{Math.abs(d)}%p)</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 반응 곡선 — 예산(x) → 예상 매출/전환(y), 체감 지점 확인용 ─────────
const AXIS = { fontSize: 13, fill: "#767C86" };

export function ResponseCurves({
  models,
  rows,
  objective,
  periodDays,
  highlight,
}: {
  models: MediaModel[];
  rows: MediaPlanRow[];
  objective: Objective;
  periodDays: number;
  highlight: string | null;
}) {
  const metric: Objective = objective === "revenue" ? "revenue" : "conversions";
  const maxX = Math.max(1, ...rows.map((r) => Math.max(r.toBe, r.asIs) * 1.6));
  const N = 48;
  const per = models.map((m) => ({ m, pts: curvePoints(m, metric, periodDays, maxX, N) }));
  const data = Array.from({ length: N + 1 }, (_, i) => {
    const row: Record<string, number> = { x: per[0]?.pts[i]?.x ?? 0 };
    for (const p of per) row[p.m.key] = p.pts[i].y;
    return row;
  });
  const fmtY = metric === "revenue" ? axisMan : (v: number) => `${Math.round(v).toLocaleString("ko-KR")}`;

  function Tip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
    if (!active || !payload?.length) return null;
    return (
      <div className="min-w-[190px] rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] shadow-[0_4px_16px_rgba(21,24,30,0.08)]">
        <p className="mb-1.5 font-medium text-ink">매체 예산 {man(Number(label))}</p>
        <ul className="space-y-1">
          {models.map((m) => {
            const v = payload.find((p) => p.dataKey === m.key)?.value as number | undefined;
            if (v == null) return null;
            return (
              <li key={m.key} className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5 text-ink-soft">
                  <span className="h-2 w-2 rounded-full" style={{ background: m.color }} aria-hidden />
                  {m.label}
                </span>
                <span className="tabular-nums text-ink">{metric === "revenue" ? man(v) : count(v)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#EEEEEA" vertical={false} />
          <XAxis dataKey="x" type="number" domain={[0, maxX]} tick={AXIS} tickLine={false} axisLine={{ stroke: "#D9D9D4" }} tickFormatter={axisMan} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={fmtY} width={48} />
          <Tooltip content={Tip} cursor={{ stroke: "#A7ACB4", strokeWidth: 1 }} />
          {models.map((m) => (
            <Line
              key={m.key}
              type="monotone"
              dataKey={m.key}
              stroke={m.color}
              strokeWidth={2}
              strokeOpacity={highlight && highlight !== m.key ? 0.15 : 1}
              dot={false}
              activeDot={{ r: 3, stroke: "#FFFFFF", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
          {rows.map((r) => {
            const dim = highlight && highlight !== r.key ? 0.2 : 1;
            const y = (b: number) => (metric === "revenue" ? (b === r.asIs ? r.asIsPred.revenue : r.toBePred.revenue) : b === r.asIs ? r.asIsPred.conversions : r.toBePred.conversions);
            return [
              <ReferenceDot key={`${r.key}-a`} x={r.asIs} y={y(r.asIs)} r={4} fill="#FFFFFF" stroke={r.color} strokeWidth={2} fillOpacity={dim} strokeOpacity={dim} ifOverflow="extendDomain" />,
              <ReferenceDot key={`${r.key}-t`} x={r.toBe} y={y(r.toBe)} r={5} fill={r.color} stroke="#FFFFFF" strokeWidth={2} fillOpacity={dim} ifOverflow="extendDomain" />,
            ];
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
