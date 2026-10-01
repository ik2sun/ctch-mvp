import { fmt } from "./calcMetrics";
import { derive, type Totals } from "./metaTypes";

export type MediaRow = {
  key: string;
  label: string;
  checked: boolean;
  connected: boolean;
  totals: Totals | null;
  note?: string; // 미연동 대신 보여줄 상태(예: 조회 준비 중인 매체)
};

const ZERO_TOTALS: Totals = { impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, reach: 0, frequency: 0 };

function Cell({ value, dim }: { value: string; dim: boolean }) {
  return <td className={`px-3 py-2.5 text-right ${dim ? "text-ink-faint" : "text-ink-soft"}`}>{value}</td>;
}

function Row({ row }: { row: MediaRow }) {
  const t = row.totals ?? ZERO_TOTALS;
  const d = derive(t);
  const dim = !row.checked;

  return (
    <tr className={`border-t border-line transition ${dim ? "opacity-50" : ""}`}>
      <td className="px-3 py-2.5 text-[15px] font-medium text-ink">{row.label}</td>
      <Cell value={row.connected ? fmt(t.cost, "won") : "—"} dim={dim} />
      <Cell value={row.connected ? fmt(t.impressions, "int") : "—"} dim={dim} />
      <Cell value={row.connected ? fmt(t.clicks, "int") : "—"} dim={dim} />
      <Cell value={row.connected ? fmt(d.ctr, "pct") : "—"} dim={dim} />
      <Cell value={row.connected ? fmt(t.conversions, "int") : "—"} dim={dim} />
      <Cell value={row.connected ? fmt(t.revenue, "won") : "—"} dim={dim} />
      <Cell value={row.connected ? fmt(d.roas, "x") : "—"} dim={dim} />
      <td className="px-3 py-2.5 text-right">
        {row.connected ? (
          <span className="whitespace-nowrap inline-flex items-center gap-1 rounded-full bg-good/10 px-2 py-0.5 text-[13px] font-medium text-good">
            ✅ 연동됨
          </span>
        ) : (
          <span className="whitespace-nowrap inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-[13px] font-medium text-ink-muted">
            ⚪ {row.note ?? "미연동"}
          </span>
        )}
      </td>
    </tr>
  );
}

export function MediaBreakdownTable({ rows }: { rows: MediaRow[] }) {
  const totalTotals = rows
    .filter((r) => r.checked && r.connected && r.totals)
    .reduce(
      (a, r) => ({
        impressions: a.impressions + r.totals!.impressions,
        clicks: a.clicks + r.totals!.clicks,
        cost: a.cost + r.totals!.cost,
        conversions: a.conversions + r.totals!.conversions,
        revenue: a.revenue + r.totals!.revenue,
        reach: 0,
        frequency: 0,
      }),
      { ...ZERO_TOTALS },
    );
  const totalDerived = derive(totalTotals);

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-[15px]">
        <thead className="bg-canvas text-ink-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">매체</th>
            <th className="px-3 py-2 text-right font-medium">광고비</th>
            <th className="px-3 py-2 text-right font-medium">노출</th>
            <th className="px-3 py-2 text-right font-medium">클릭</th>
            <th className="px-3 py-2 text-right font-medium">CTR</th>
            <th className="px-3 py-2 text-right font-medium">전환수</th>
            <th className="px-3 py-2 text-right font-medium">전환매출</th>
            <th className="px-3 py-2 text-right font-medium">ROAS</th>
            <th className="px-3 py-2 text-right font-medium">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <Row key={r.key} row={r} />
          ))}
          <tr className="border-t border-line bg-canvas/60 font-semibold">
            <td className="px-3 py-2.5 text-[15px] text-ink">합계</td>
            <td className="px-3 py-2.5 text-right text-ink">{fmt(totalTotals.cost, "won")}</td>
            <td className="px-3 py-2.5 text-right text-ink">{fmt(totalTotals.impressions, "int")}</td>
            <td className="px-3 py-2.5 text-right text-ink">{fmt(totalTotals.clicks, "int")}</td>
            <td className="px-3 py-2.5 text-right text-ink">{fmt(totalDerived.ctr, "pct")}</td>
            <td className="px-3 py-2.5 text-right text-ink">{fmt(totalTotals.conversions, "int")}</td>
            <td className="px-3 py-2.5 text-right text-ink">{fmt(totalTotals.revenue, "won")}</td>
            <td className="px-3 py-2.5 text-right text-ink">{fmt(totalDerived.roas, "x")}</td>
            <td className="px-3 py-2.5" />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
