"use client";

// 입찰가 곡선 — 입찰가(가로, 로그 눈금)별 예상 클릭 / 예상 비용을 차트 두 개로(이중 축 금지, ctch-dataviz).
// 단일 시리즈라 범례 없이 제목으로 읽고, '내 입찰가'는 세로 기준선. 차트를 누르면 그 입찰가로 바뀐다.
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TooltipContentProps } from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

export type LadderPoint = { bid: number; impressions: number; clicks: number; cost: number };

const AXIS = { fontSize: 13, fill: "#4A4F58", fontWeight: 500 };
const GRID = "#EEEEEA";
export const wonShort = (v: number) => (v >= 1e8 ? `${(v / 1e8).toFixed(1)}억` : v >= 1e4 ? `${Math.round(v / 1e4).toLocaleString("ko-KR")}만` : Math.round(v).toLocaleString("ko-KR"));
const won = (v: number) => `₩${Math.round(v).toLocaleString("ko-KR")}`;
const n0 = (v: number) => Math.round(v).toLocaleString("ko-KR");

function LadderTooltip({ active, payload }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as LadderPoint;
  return (
    <div className="min-w-[180px] rounded-lg border border-line bg-surface px-3 py-2.5 text-[13px] shadow-[0_4px_16px_rgba(21,24,30,0.08)]">
      <p className="mb-1.5 font-medium text-ink">입찰가 {won(p.bid)}</p>
      <ul className="space-y-1 tabular-nums">
        <li className="flex justify-between gap-4"><span className="text-ink-muted">노출</span><span className="text-ink">{n0(p.impressions)}</span></li>
        <li className="flex justify-between gap-4"><span className="text-ink-muted">클릭</span><span className="text-ink">{n0(p.clicks)}</span></li>
        <li className="flex justify-between gap-4"><span className="text-ink-muted">비용</span><span className="text-ink">{won(p.cost)}</span></li>
        <li className="flex justify-between gap-4"><span className="text-ink-muted">평균 CPC</span><span className="text-ink">{p.clicks ? won(p.cost / p.clicks) : "—"}</span></li>
      </ul>
      <p className="mt-1.5 border-t border-line pt-1.5 text-[12px] text-ink-muted">누르면 이 입찰가로 설정</p>
    </div>
  );
}

// 로그 눈금은 기본 눈금이 빽빽해서 1·2·5 단위로 직접 고른다
const NICE = [10, 20, 30, 50, 70, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000, 7000, 10000, 15000, 20000, 30000, 50000, 70000, 100000];
function niceTicks(points: LadderPoint[]): number[] {
  if (!points.length) return [];
  const lo = points[0].bid;
  const hi = points[points.length - 1].bid;
  return NICE.filter((t) => t >= lo && t <= hi);
}

function OneChart({ title, dataKey, points, color, bid, onPick, format }: {
  title: string;
  dataKey: "clicks" | "cost";
  points: LadderPoint[];
  color: string;
  bid: number;
  onPick: (bid: number) => void;
  format: (v: number) => string;
}) {
  return (
    <div className="min-w-0">
      <p className="mb-2 text-[14px] font-semibold text-ink">{title}</p>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
            onClick={(s) => {
              const i = Number(s?.activeTooltipIndex);
              if (Number.isFinite(i) && points[i]) onPick(points[i].bid);
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="bid"
              type="number"
              scale="log"
              domain={["dataMin", "dataMax"]}
              ticks={niceTicks(points)}
              tick={AXIS}
              tickFormatter={wonShort}
              axisLine={{ stroke: "#D9D9D4" }}
              tickLine={false}
              allowDataOverflow
            />
            <YAxis tick={AXIS} tickFormatter={format} axisLine={false} tickLine={false} width={56} />
            <Tooltip content={LadderTooltip} cursor={{ stroke: "#D9D9D4" }} />
            {bid > 0 && <ReferenceLine x={bid} stroke="#344054" strokeWidth={1} label={{ value: "내 입찰가", position: "insideTopRight", fill: "#344054", fontSize: 12 }} />}
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function LadderCharts({ points, color, bid, onPick }: { points: LadderPoint[]; color: string; bid: number; onPick: (bid: number) => void }) {
  // 클릭이 0인 낮은 입찰가 구간은 첫 클릭 직전 한 점만 남기고 자른다(그래프 절반이 바닥선이 되지 않게)
  const all = points.filter((p) => p.bid > 0).sort((a, b) => a.bid - b.bid);
  const first = all.findIndex((p) => p.clicks > 0);
  const data = first > 1 ? all.slice(first - 1) : all;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <OneChart title="입찰가별 예상 클릭" dataKey="clicks" points={data} color={color} bid={bid} onPick={onPick} format={wonShort} />
      <OneChart title="입찰가별 예상 비용" dataKey="cost" points={data} color={color} bid={bid} onPick={onPick} format={wonShort} />
    </div>
  );
}

// 곡선 해석 — 포화 입찰가, 현재 입찰가에서 한 단계 올렸을 때의 추가 클릭당 비용
// exact: 지금 입찰가의 정확한 견적(네이버는 표의 키워드별 값) — 있으면 곡선의 가까운 점 대신 쓴다
export function readLadder(points: LadderPoint[], bid: number, exact?: LadderPoint | null) {
  const pts = points.filter((p) => p.bid > 0).sort((a, b) => a.bid - b.bid);
  const maxClicks = Math.max(0, ...pts.map((p) => p.clicks));
  const saturation = maxClicks > 0 ? pts.find((p) => p.clicks >= maxClicks * 0.98) ?? null : null;
  const firstClick = pts.find((p) => p.clicks > 0) ?? null;
  const cur = exact && exact.bid === bid ? exact : ([...pts].reverse().find((p) => p.bid <= bid) ?? pts[0] ?? null);
  const next = cur ? pts.find((p) => p.bid > cur.bid && p.clicks > cur.clicks) ?? null : null;
  const step = cur && next ? { bid: next.bid, clicks: next.clicks - cur.clicks, cost: next.cost - cur.cost, perClick: (next.cost - cur.cost) / Math.max(1, next.clicks - cur.clicks) } : null;
  return { maxClicks, saturation, firstClick, cur, step };
}
