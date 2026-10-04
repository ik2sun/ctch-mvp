"use client";

// 매체 효율 표 — 퍼널 순서(노출→클릭→장바구니→전환→매출)로 매체별 성과와 비교 기간 대비 변화를 한 표에.
// 숫자는 표에서 정확히 읽히고, 색은 매체 식별(점)과 비중 막대에만 쓴다. 좁은 화면에선 가로 스크롤 + 매체명 열 고정.
// 2026-10-04: 효율 지표(CTR·CPC·CVR·CPA·ROAS) 셀에 합계 대비 히트맵(좋음 파랑·나쁨 빨강, 차이 클수록 진하게 — 숫자는 그대로),
// renderDetail을 주면 행을 눌러 아래로 펼쳐지는 드릴다운(캠페인·소재).
import { Fragment, useState, type ReactNode } from "react";
import { fmt } from "@/features/ai-report/calcMetrics";
import type { Totals } from "@/features/ai-report/metaTypes";
import { DeltaChip } from "./KpiStrip";
import { change, ratios, type MediaEfficiency, type Ratios } from "./analysis";

type Polarity = "up" | "down" | "neutral";
type ColKey = "cost" | "impressions" | "clicks" | "ctr" | "cpc" | "addToCart" | "conversions" | "cvr" | "cpa" | "revenue" | "roas";

type Col = {
  key: ColKey;
  label: string;
  hint?: string;
  kind: "won" | "int" | "pct" | "x";
  polarity: Polarity;
  get: (t: Totals, r: Ratios) => number | null;
  strong?: boolean; // 핵심 지표는 진하게
  wide?: boolean; // 보조 지표 — 1536px 이상에서만 표시(좁으면 ROAS 같은 핵심 열이 밀려나지 않게)
};

const COLS: Col[] = [
  { key: "cost", label: "광고비 · 비중", kind: "won", polarity: "neutral", get: (t) => t.cost, strong: true },
  { key: "impressions", label: "노출", kind: "int", polarity: "neutral", get: (t) => t.impressions, wide: true },
  { key: "clicks", label: "클릭", kind: "int", polarity: "up", get: (t) => t.clicks, wide: true },
  { key: "ctr", label: "CTR", hint: "클릭 ÷ 노출", kind: "pct", polarity: "up", get: (_, r) => r.ctr },
  { key: "cpc", label: "CPC", hint: "광고비 ÷ 클릭", kind: "won", polarity: "down", get: (_, r) => r.cpc, wide: true },
  { key: "addToCart", label: "장바구니", hint: "장바구니 담기 — 현재 메타만 제공(그 외 매체는 —)", kind: "int", polarity: "up", get: (t) => t.addToCart ?? null },
  { key: "conversions", label: "전환", kind: "int", polarity: "up", get: (t) => t.conversions, strong: true },
  { key: "cvr", label: "CVR", hint: "전환 ÷ 클릭", kind: "pct", polarity: "up", get: (_, r) => r.cvr },
  { key: "cpa", label: "CPA", hint: "광고비 ÷ 전환", kind: "won", polarity: "down", get: (_, r) => r.cpa, strong: true },
  { key: "revenue", label: "전환매출", kind: "won", polarity: "up", get: (t) => t.revenue, strong: true },
  { key: "roas", label: "ROAS", hint: "전환매출 ÷ 광고비", kind: "x", polarity: "up", get: (_, r) => r.roas, strong: true },
];

const CELL = "px-2.5 py-4 text-right 2xl:px-3.5";
const HEAT = new Set<ColKey>(["ctr", "cpc", "cvr", "cpa", "roas"]);

// 합계 대비 편차 → 배경색. 좋은 방향 ±50%에서 최대 진하기(알파 0.16), 5% 미만 차이는 칠하지 않는다.
function heat(v: number | null, base: number | null, polarity: Polarity): string | undefined {
  if (v == null || base == null || base <= 0 || polarity === "neutral") return undefined;
  const dev = v / base - 1;
  const good = polarity === "up" ? dev : -dev;
  const mag = Math.min(1, Math.abs(good) / 0.5);
  if (Math.abs(good) < 0.05) return undefined;
  const a = (0.04 + mag * 0.12).toFixed(3);
  return good > 0 ? `rgba(37, 99, 235, ${a})` : `rgba(220, 38, 38, ${a})`;
}

export function MediaEfficiencyTable({
  rows,
  total,
  totalPrev,
  inactive = [],
  highlight,
  onHighlight,
  noun = "매체",
  renderDetail,
}: {
  rows: MediaEfficiency[];
  total: Totals;
  totalPrev: Totals | null;
  inactive?: { key: string; label: string; note: string }[];
  highlight: string | null;
  onHighlight: (key: string | null) => void;
  noun?: string; // 첫 열 제목(매체·캠페인 등)
  renderDetail?: (key: string) => ReactNode; // 행 클릭 드릴다운
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  // 비교 기간이 없으면(파일 분석) 증감 줄을 아예 그리지 않는다
  const showChange = totalPrev != null || rows.some((r) => r.series.previous);
  // 장바구니를 주는 매체가 하나도 없으면 열 자체를 숨긴다
  const cols = COLS.filter((c) => c.key !== "addToCart" || rows.some((r) => r.series.current.addToCart != null));
  const [sort, setSort] = useState<{ key: ColKey; desc: boolean }>({ key: "cost", desc: true });
  const colOf = (k: ColKey) => COLS.find((c) => c.key === k)!;
  const sorted = [...rows].sort((a, b) => {
    const c = colOf(sort.key);
    const fallback = c.polarity === "down" ? Number.MAX_VALUE : -1;
    const d = (c.get(a.series.current, a.cur) ?? fallback) - (c.get(b.series.current, b.cur) ?? fallback);
    return sort.desc ? -d : d;
  });
  const tr = ratios(total);
  const tp = totalPrev ? ratios(totalPrev) : null;
  const maxShare = Math.max(0.0001, ...rows.map((r) => r.spendShare));

  const valueCell = (c: Col, cur: Totals, curR: Ratios, prev: Totals | null, prevR: Ratios | null, extra?: React.ReactNode, isTotal = false) => {
    const v = c.get(cur, curR);
    const p = prev && prevR ? c.get(prev, prevR) : null;
    const bg = !isTotal && HEAT.has(c.key) && rows.length > 1 ? heat(v, c.get(total, tr), c.polarity) : undefined;
    return (
      <td key={c.key} className={`${CELL} ${c.wide ? "hidden 2xl:table-cell" : ""}`} style={bg ? { background: bg } : undefined}>
        <div className="flex items-center justify-end gap-2.5">
          {extra}
          <span className={`whitespace-nowrap font-semibold ${c.strong ? "text-[#1A1A1A]" : "text-ink-soft"}`}>{fmt(v, c.kind)}</span>
        </div>
        {showChange && (
          <div className="mt-1 flex items-center justify-end gap-2 text-[13px] text-ink-muted">
            {c.key === "cost" && rows.length > 0 && <span>{((cur.cost / Math.max(1, total.cost)) * 100).toFixed(0)}%</span>}
            <DeltaChip value={v != null && p != null ? change(v, p) : null} polarity={c.polarity} size="xs" />
          </div>
        )}
        {!showChange && c.key === "cost" && rows.length > 0 && (
          <div className="mt-1 text-[13px] text-ink-muted">{((cur.cost / Math.max(1, total.cost)) * 100).toFixed(0)}%</div>
        )}
      </td>
    );
  };

  return (
    // contain:paint — 고정(sticky) 열이 페이지 전체 가로 폭을 늘리지 않게 표 영역 안에 가둔다
    <div className="overflow-x-auto [contain:paint]">
      <table className="w-full min-w-[820px] text-[16px] 2xl:min-w-[1080px]">
        <thead>
          <tr className="border-b border-line text-[15px] text-ink-muted">
            <th className="sticky left-0 z-10 bg-surface py-3 pr-4 text-left font-normal">{noun}</th>
            {cols.map((c) => (
              <th key={c.key} className={`whitespace-nowrap px-2.5 py-3 text-right font-normal 2xl:px-3.5 ${c.wide ? "hidden 2xl:table-cell" : ""}`} title={c.hint}>
                <button
                  type="button"
                  onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : c.polarity !== "down" }))}
                  className={`inline-flex items-center gap-0.5 hover:text-ink ${sort.key === c.key ? "text-ink" : ""}`}
                >
                  {c.label}
                  {sort.key === c.key && <span aria-hidden>{sort.desc ? "↓" : "↑"}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {sorted.map((r) => {
            const dim = highlight != null && highlight !== r.series.key;
            const prev = r.series.previous;
            const open = openKey === r.series.key;
            return (
              <Fragment key={r.series.key}>
              <tr
                onMouseEnter={() => onHighlight(r.series.key)}
                onMouseLeave={() => onHighlight(null)}
                onClick={renderDetail ? () => setOpenKey(open ? null : r.series.key) : undefined}
                aria-expanded={renderDetail ? open : undefined}
                className={`group border-b border-line/70 transition-opacity ${dim ? "opacity-40" : ""} ${renderDetail ? "cursor-pointer hover:bg-canvas/60" : ""} ${open ? "bg-canvas/60" : ""}`}
              >
                <td className="sticky left-0 z-10 bg-surface py-4 pr-4">
                  <span className="flex items-center gap-2.5 whitespace-nowrap font-semibold text-[#1A1A1A]">
                    {renderDetail && <span className={`text-[12px] text-ink-muted transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>▶</span>}
                    {r.series.color && <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: r.series.color }} aria-hidden />}
                    {r.series.label}
                    {r.series.dailyApprox && <span className="rounded bg-canvas px-1.5 py-0.5 text-[12px] font-normal text-ink-muted">일별 근사</span>}
                  </span>
                </td>
                {cols.map((c) =>
                  valueCell(
                    c,
                    r.series.current,
                    r.cur,
                    prev,
                    r.prev,
                    c.key === "cost" ? (
                      <span className="hidden h-2 w-14 overflow-hidden rounded-full bg-canvas 2xl:block" aria-hidden>
                        <span className="block h-full rounded-full" style={{ width: `${(r.spendShare / maxShare) * 100}%`, background: r.series.color }} />
                      </span>
                    ) : undefined,
                  ),
                )}
              </tr>
              {open && renderDetail && (
                <tr className="border-b border-line/70 bg-canvas/40">
                  <td colSpan={cols.length + 1} className="px-3 py-4">
                    {renderDetail(r.series.key)}
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
          {inactive.map((m) => (
            <tr key={m.key} className="border-b border-line/70 text-[15px] text-ink-faint">
              <td className="sticky left-0 z-10 bg-surface py-3.5 pr-4">
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full border border-line" aria-hidden />
                  {m.label}
                </span>
              </td>
              <td colSpan={cols.length} className="px-3 py-3.5 text-right text-[15px]">
                {m.note}
              </td>
            </tr>
          ))}
          {rows.length > 0 && (
            <tr className="bg-canvas font-semibold">
              <td className="sticky left-0 z-10 rounded-l-lg bg-canvas py-4 pl-3 pr-4 text-[#1A1A1A]">합계</td>
              {cols.map((c) => valueCell(c, total, tr, totalPrev, tp, undefined, true))}
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
        {rows.length > 1 && (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-sm" style={{ background: "rgba(37, 99, 235, 0.14)" }} aria-hidden /> 합계보다 좋음
            <span className="ml-1.5 h-3 w-5 rounded-sm" style={{ background: "rgba(220, 38, 38, 0.14)" }} aria-hidden /> 나쁨 · CTR·CPC·CVR·CPA·ROAS, 차이가 클수록 진하게
          </span>
        )}
        {renderDetail && <span>행을 누르면 캠페인·소재 상세가 펼쳐져요</span>}
        {cols.some((c) => c.key === "addToCart") && <span>장바구니는 현재 메타만 제공해요(그 외 —)</span>}
      </div>
    </div>
  );
}
