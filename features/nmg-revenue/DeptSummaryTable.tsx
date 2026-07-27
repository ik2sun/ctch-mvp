import type { MetricSeries } from "@/lib/google-sheets/parseDeptSummary";

function fmt(metric: string, n: number): string {
  if (metric === "수익률") return `${n.toFixed(2)}%`;
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

export function DeptSummaryTable({ metrics }: { metrics: MetricSeries[] }) {
  if (metrics.length === 0) return null;
  const months = metrics[0].values.map((v) => v.month);

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-[12px]">
        <thead className="bg-canvas text-ink-muted">
          <tr>
            <th className="whitespace-nowrap px-3 py-2 text-left font-medium">지표</th>
            {months.map((m) => (
              <th key={m} className="whitespace-nowrap px-3 py-2 text-right font-medium">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.metric} className="border-t border-line">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">{m.metric}</td>
              {m.values.map((v, i) => (
                <td key={i} className="whitespace-nowrap px-3 py-2 text-right text-ink-soft">
                  {fmt(m.metric, v.value)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
