"use client";

// 상단 KPI 타일 — 값 + 비교 기간 대비 증감 + 일별 스파크라인(합산). 증감 색은 지표 성격(높을수록 좋은지)에 따른다.
import type { DailyPoint, Totals } from "@/features/ai-report/metaTypes";
import { fmt } from "@/features/ai-report/calcMetrics";
import { change, ratios } from "./analysis";

type Polarity = "up" | "down" | "neutral"; // up=오를수록 좋음, down=내릴수록 좋음, neutral=판단 안 함(광고비)

type Kpi = {
  key: string;
  icon: string;
  label: string;
  value: number | null;
  prev: number | null;
  kind: "won" | "int" | "x";
  polarity: Polarity;
  spark: (number | null)[];
};

export function DeltaChip({ value, polarity, size = "sm" }: { value: number | null; polarity: Polarity; size?: "sm" | "xs" }) {
  const fs = size === "xs" ? "text-[13px]" : "text-[15px]";
  if (value == null || !isFinite(value)) return <span className={`${fs} text-ink-faint`}>—</span>;
  const up = value > 0;
  const flat = Math.abs(value) < 0.5;
  const good = polarity === "neutral" || flat ? null : polarity === "up" ? up : !up;
  const tone = good == null ? "text-ink-muted" : good ? "text-good" : "text-bad";
  // 방향은 글자 화살표(↗↘)로 — 색약·아이콘 폰트 미로딩에서도 읽히게
  return (
    <span className={`inline-flex items-center gap-0.5 whitespace-nowrap font-medium tabular-nums ${tone} ${fs}`}>
      <span aria-hidden>{flat ? "→" : up ? "↗" : "↘"}</span>
      {flat ? "0%" : `${up ? "+" : "−"}${Math.abs(value).toFixed(1)}%`}
      <span className="sr-only">{flat ? "변화 없음" : up ? "증가" : "감소"}</span>
    </span>
  );
}

function Sparkline({ values, color }: { values: (number | null)[]; color: string }) {
  const pts = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v != null && isFinite(p.v));
  if (pts.length < 2) return <div className="h-10" />;
  const w = 120;
  const h = 32;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 3 - ((v - min) / span) * (h - 6);
  const d = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-full" preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <path d={`M${x(last.i).toFixed(1)},${y(last.v).toFixed(1)}h0.01`} stroke={color} strokeWidth={6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function KpiStrip({
  total,
  totalPrev,
  daily,
  compareLabel,
  loading,
  secondary = false,
}: {
  total: Totals | null;
  totalPrev: Totals | null;
  daily: DailyPoint[];
  compareLabel?: string; // 없으면 비교 줄·증감을 숨김(비교 기간이 없는 파일 분석 등)
  loading: boolean;
  secondary?: boolean; // 노출·클릭·CTR·CVR·CPC 보조 줄
}) {
  const showCompare = !!compareLabel;
  const showSpark = daily.length > 1;
  const cur = total ? ratios(total) : null;
  const prev = totalPrev ? ratios(totalPrev) : null;
  const kpis: Kpi[] = [
    { key: "cost", icon: "ti-wallet", label: "광고비", value: total?.cost ?? null, prev: totalPrev?.cost ?? null, kind: "won", polarity: "neutral", spark: daily.map((d) => d.cost) },
    { key: "revenue", icon: "ti-cash", label: "전환매출", value: total?.revenue ?? null, prev: totalPrev?.revenue ?? null, kind: "won", polarity: "up", spark: daily.map((d) => d.revenue) },
    { key: "roas", icon: "ti-chart-line", label: "ROAS", value: cur?.roas ?? null, prev: prev?.roas ?? null, kind: "x", polarity: "up", spark: daily.map((d) => (d.cost ? d.revenue / d.cost : null)) },
    { key: "conversions", icon: "ti-shopping-cart", label: "전환수", value: total?.conversions ?? null, prev: totalPrev?.conversions ?? null, kind: "int", polarity: "up", spark: daily.map((d) => d.conversions) },
    { key: "cpa", icon: "ti-target-arrow", label: "CPA", value: cur?.cpa ?? null, prev: prev?.cpa ?? null, kind: "won", polarity: "down", spark: daily.map((d) => (d.conversions ? d.cost / d.conversions : null)) },
  ];

  return (
    <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 min-[1440px]:grid-cols-5 transition-opacity ${loading ? "opacity-60" : ""}`}>
      {kpis.map((k, i) => (
        <div
          key={k.key}
          className={`flex min-w-0 flex-col rounded-card border border-line bg-surface px-5 pb-4 pt-5 ${i === 0 ? "col-span-2 md:col-span-1" : ""}`}
        >
          {/* ① 지표명(회색, 뒤로) · ② 증감(우측 상단) */}
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2.5 text-[15px] text-ink-muted">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-line bg-canvas" aria-hidden>
                <i className={`ti ${k.icon} text-[18px] text-ink-soft`} />
              </span>
              {k.label}
            </p>
            {showCompare && <DeltaChip value={change(k.value, k.prev)} polarity={k.polarity} />}
          </div>
          {/* ③ 현재 수치 — 가장 크게. 화면 폭에 따라 28~36px(긴 금액이 넘치지 않게) */}
          <p className="mt-2 whitespace-nowrap text-[clamp(28px,2.1vw,36px)] font-bold leading-tight tracking-tight text-[#1A1A1A]">{total ? fmt(k.value, k.kind) : "—"}</p>
          {showCompare && (
            <p className="mt-1 text-[13px] text-ink-muted">
              {compareLabel} {total && k.prev != null ? fmt(k.prev, k.kind) : "—"}
            </p>
          )}
          {showSpark && (
            <div className="mt-3">
              <Sparkline values={k.spark} color="#4F46E5" />
            </div>
          )}
        </div>
      ))}
      {secondary && total && <SecondaryStats total={total} totalPrev={showCompare ? totalPrev : null} />}
    </div>
  );
}

// 보조 지표 한 줄 — 노출·클릭·CTR·CVR·CPC
function SecondaryStats({ total, totalPrev }: { total: Totals; totalPrev: Totals | null }) {
  const c = ratios(total);
  const p = totalPrev ? ratios(totalPrev) : null;
  const items: { label: string; value: string; delta: number | null; polarity: Polarity }[] = [
    { label: "노출", value: fmt(total.impressions, "int"), delta: change(total.impressions, totalPrev?.impressions ?? null), polarity: "neutral" },
    { label: "클릭", value: fmt(total.clicks, "int"), delta: change(total.clicks, totalPrev?.clicks ?? null), polarity: "up" },
    { label: "CTR", value: fmt(c.ctr, "pct"), delta: change(c.ctr, p?.ctr ?? null), polarity: "up" },
    { label: "CVR", value: fmt(c.cvr, "pct"), delta: change(c.cvr, p?.cvr ?? null), polarity: "up" },
    { label: "CPC", value: fmt(c.cpc, "won"), delta: change(c.cpc, p?.cpc ?? null), polarity: "down" },
  ];
  return (
    <div className="col-span-full flex flex-wrap items-center gap-x-8 gap-y-2 rounded-card border border-line bg-surface px-5 py-3.5">
      {items.map((it) => (
        <div key={it.label} className="flex items-baseline gap-2">
          <span className="text-[15px] text-ink-muted">{it.label}</span>
          <span className="text-[16px] font-semibold tabular-nums text-[#1A1A1A]">{it.value}</span>
          {totalPrev && <DeltaChip value={it.delta} polarity={it.polarity} size="xs" />}
        </div>
      ))}
    </div>
  );
}
