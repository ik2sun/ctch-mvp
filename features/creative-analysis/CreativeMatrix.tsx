"use client";

// 후킹(CTR) × 전환(CVR) 사분면 — 전환 목표 소재 중 판단 가능한 것만. 점 크기 = 광고비.
// 강조형: 상위 25% 이상 소재는 인디고, 나머지는 회색. 기준선은 중앙값(실선 헤어라인).
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import * as XLSX from "xlsx";
import { fmt } from "@/features/ai-report/calcMetrics";
import type { Enriched } from "./analyze";
import { Thumb } from "./CreativeGallery";

type Pt = { x: number; y: number; z: number; row: Enriched };

function median(v: number[]) {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[Math.floor((s.length - 1) / 2)] : 0;
}

function Tip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  const p = active ? (payload?.[0]?.payload as Pt | undefined) : undefined;
  if (!p) return null;
  const r = p.row;
  return (
    <div className="flex w-[260px] gap-2.5 rounded-lg border border-line bg-surface p-2.5 text-[12px] shadow-[0_4px_16px_rgba(21,24,30,0.1)]">
      <Thumb row={r} className="h-16 w-16 flex-shrink-0 rounded" />
      <div className="min-w-0">
        <p className="truncate font-mono text-ink">{r.name}</p>
        <p className="mt-1 tabular-nums text-ink-soft">
          CTR {fmt(r.ctr, "pct")} · CVR {fmt(r.cvr, "pct")}
        </p>
        <p className="tabular-nums text-ink-soft">
          ROAS {fmt(r.roas, "x")} · 광고비 {fmt(r.cost, "won")}
        </p>
        <p className="mt-0.5 text-ink-faint">눌러서 자세히 보기</p>
      </div>
    </div>
  );
}

const GRADE_LABEL: Record<string, string> = { top: "상위 10%", good: "상위 25%", mid: "중간", low: "하위 25%", hold: "판단 보류" };
const pct2 = (v: number | null) => (v == null ? null : Math.round(v * 10000) / 100);

// 4개 유형 소재 엑셀 — 전체 시트(유형 열 포함) + 유형별 시트 + 기준
function downloadQuadrants(pts: Pt[], mx: number, my: number, quadOf: (p: Pt) => string, fileTag?: string) {
  const head = ["유형", "소재명", "광고 ID", "상태", "캠페인", "광고세트", "광고비(원)", "노출", "링크 클릭", "CTR(%)", "CVR(%)", "전환", "매출(원)", "ROAS(%)", "CPA(원)", "등급", "랜딩 URL"];
  const line = (p: Pt) => {
    const r = p.row;
    return [quadOf(p), r.name, r.id, r.status, r.campaignName, r.adsetName, Math.round(r.cost), Math.round(r.impressions), Math.round(r.linkClicks), pct2(r.ctr), pct2(r.cvr), Math.round(r.conversions * 100) / 100, Math.round(r.revenue), r.roas == null ? null : Math.round(r.roas * 100), r.cpa == null ? null : Math.round(r.cpa), GRADE_LABEL[r.grade] ?? r.grade, r.landingUrl ?? ""];
  };
  const sorted = [...pts].sort((a, b) => b.row.cost - a.row.cost);
  const wb = XLSX.utils.book_new();
  const add = (name: string, aoa: unknown[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = name === "기준" ? [{ wch: 18 }, { wch: 90 }] : head.map((_, i) => ({ wch: i === 1 ? 44 : i === 16 ? 50 : i === 4 || i === 5 ? 30 : 12 }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add("전체", [head, ...sorted.map(line)]);
  for (const q of QUADS) add(`${q.title}(${sorted.filter((p) => quadOf(p) === q.title).length})`, [head, ...sorted.filter((p) => quadOf(p) === q.title).map(line)]);
  add("기준", [
    ["후킹 × 전환 진단"],
    ["대상", "전환 캠페인 소재 중 판단 기준 노출 이상 · CTR·CVR 계산 가능 · 링크 클릭 30회 이상"],
    ["기준선", `CTR 중앙값 ${pct2(mx)}% · CVR 중앙값 ${pct2(my)}% (같거나 높으면 위/오른쪽)`],
    ...QUADS.map((q) => [q.title, q.hint]),
    ["내려받은 시각", new Date().toLocaleString("ko-KR")],
  ]);
  XLSX.writeFile(wb, `CTCH_후킹x전환_${fileTag ?? ""}.xlsx`.replace(/[\\/:*?"<>|]/g, ""));
}

const QUADS = [
  { key: "win", title: "승리형", hint: "눈길도 끌고 구매도 됨 → 증액·변형 제작", fx: true, fy: true },
  { key: "conv", title: "전환형", hint: "클릭은 적지만 구매로 잘 이어짐 → 썸네일·첫 문구 강화", fx: false, fy: true },
  { key: "hook", title: "후킹형", hint: "클릭은 되는데 구매가 약함 → 랜딩·혜택 점검", fx: true, fy: false },
  { key: "swap", title: "교체 후보", hint: "둘 다 약함 → 예산 회수", fx: false, fy: false },
];

export function CreativeMatrix({ rows, onOpen, fileTag }: { rows: Enriched[]; onOpen: (r: Enriched) => void; fileTag?: string }) {
  const pts: Pt[] = rows.filter((r) => r.judged && r.ctr != null && r.cvr != null && r.linkClicks >= 30).map((r) => ({ x: r.ctr!, y: r.cvr!, z: r.cost, row: r }));
  if (pts.length < 6) return <p className="py-10 text-center text-[15px] text-ink-muted">판단 가능한 전환 소재가 6개 이상일 때 사분면을 그려요.</p>;
  const mx = median(pts.map((p) => p.x));
  const my = median(pts.map((p) => p.y));
  const hi = pts.filter((p) => p.row.grade === "top" || p.row.grade === "good");
  const rest = pts.filter((p) => !(p.row.grade === "top" || p.row.grade === "good"));
  const q = (fx: boolean, fy: boolean) => pts.filter((p) => (p.x >= mx) === fx && (p.y >= my) === fy).length;
  const quadOf = (p: Pt) => QUADS.find((x) => (p.x >= mx) === x.fx && (p.y >= my) === x.fy)!.title;

  const quadrant = [
    { pos: "left-14 top-2", title: "전환형", hint: "클릭은 적지만 구매로 잘 이어짐 → 썸네일·첫 문구 강화", n: q(false, true) },
    { pos: "right-3 top-2 text-right", title: "승리형", hint: "눈길도 끌고 구매도 됨 → 증액·변형 제작", n: q(true, true) },
    { pos: "left-14 bottom-9", title: "교체 후보", hint: "둘 다 약함 → 예산 회수", n: q(false, false) },
    { pos: "right-3 bottom-9 text-right", title: "후킹형", hint: "클릭은 되는데 구매가 약함 → 랜딩·혜택 점검", n: q(true, false) },
  ];

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-[12px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-signal" aria-hidden />
          상위 25% 이상 소재
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-ink-faint" aria-hidden />
          그 외
        </span>
        <span>점 크기 = 광고비 · 기준선 = 중앙값 (CTR {fmt(mx, "pct")}, CVR {fmt(my, "pct")})</span>
        <button type="button" onClick={() => downloadQuadrants(pts, mx, my, quadOf, fileTag)} className="ml-auto h-8 rounded-lg border border-line px-3 text-[13px] text-ink-soft hover:border-signal hover:text-signal" title="전체 + 승리형·전환형·후킹형·교체 후보 시트(광고비순) + 기준">
          <i className="ti ti-download mr-1" aria-hidden />
          유형별 소재 엑셀
        </button>
      </div>
      <div className="relative h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="#EEEEEA" />
            <XAxis type="number" dataKey="x" name="CTR" tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} tick={{ fontSize: 13, fill: "#4A4F58", fontWeight: 500 }} tickLine={false} axisLine={{ stroke: "#D9D9D4" }} domain={[0, "auto"]} />
            <YAxis type="number" dataKey="y" name="CVR" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 13, fill: "#4A4F58", fontWeight: 500 }} tickLine={false} axisLine={false} width={52} domain={[0, "auto"]} />
            <ZAxis type="number" dataKey="z" range={[30, 420]} />
            <ReferenceLine x={mx} stroke="#C9C9C3" />
            <ReferenceLine y={my} stroke="#C9C9C3" />
            <Tooltip content={Tip} cursor={false} />
            <Scatter data={rest} fill="#A7ACB4" fillOpacity={0.55} stroke="#FFFFFF" strokeWidth={1} onClick={(d) => onOpen((d as unknown as { payload: Pt }).payload.row)} className="cursor-pointer" isAnimationActive={false} />
            <Scatter data={hi} fill="#4F46E5" fillOpacity={0.8} stroke="#FFFFFF" strokeWidth={1.5} onClick={(d) => onOpen((d as unknown as { payload: Pt }).payload.row)} className="cursor-pointer" isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
        {quadrant.map((qd) => (
          <div key={qd.title} className={`pointer-events-none absolute max-w-[42%] ${qd.pos}`}>
            <p className="text-[12px] font-semibold text-ink-soft">
              {qd.title} <span className="font-normal tabular-nums text-ink-faint">{qd.n}</span>
            </p>
            <p className="hidden text-[12px] leading-snug text-ink-muted md:block">{qd.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
