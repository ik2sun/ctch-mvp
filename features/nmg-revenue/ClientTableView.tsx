import type { ClientSeries } from "@/lib/google-sheets/parseClientPivot";

function fmt(n: number): string {
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

export function ClientTableView({ clients }: { clients: ClientSeries[] }) {
  if (clients.length === 0) {
    return <p className="py-8 text-center text-[13px] text-ink-muted">이 탭에는 아직 입력된 광고주 데이터가 없어요.</p>;
  }
  const months = clients[0].values.map((v) => v.month);
  const totals = months.map((_, i) => clients.reduce((sum, c) => sum + (c.values[i]?.value ?? 0), 0));

  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-[12px]">
        <thead className="bg-canvas text-ink-muted">
          <tr>
            <th className="whitespace-nowrap px-3 py-2 text-left font-medium">광고주</th>
            {months.map((m) => (
              <th key={m} className="whitespace-nowrap px-3 py-2 text-right font-medium">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.client} className="border-t border-line">
              <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">{c.client}</td>
              {c.values.map((v, i) => (
                <td key={i} className="whitespace-nowrap px-3 py-2 text-right text-ink-soft">{fmt(v.value)}</td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-line bg-canvas/60 font-semibold">
            <td className="whitespace-nowrap px-3 py-2 text-ink">합계</td>
            {totals.map((t, i) => (
              <td key={i} className="whitespace-nowrap px-3 py-2 text-right text-ink">{fmt(t)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
