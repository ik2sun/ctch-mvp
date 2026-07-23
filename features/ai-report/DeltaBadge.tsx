export function delta(cur: number, prev: number) {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

export function DeltaBadge({ value, inverse }: { value: number | null; inverse?: boolean }) {
  if (value === null || !isFinite(value)) return <span className="text-[11px] text-ink-faint">—</span>;
  const up = value >= 0;
  const good = inverse ? !up : up;
  return (
    <span className={`text-[11px] font-medium ${good ? "text-good" : "text-bad"}`}>
      {up ? "▲" : "▼"} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function ComparisonRows({
  cur,
  prev,
  mon,
  inverse,
}: {
  cur: number;
  prev: number;
  mon: number;
  inverse?: boolean;
}) {
  return (
    <div className="mt-1.5 space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-faint">전주 대비</span>
        <DeltaBadge value={delta(cur, prev)} inverse={inverse} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-faint">전월 대비</span>
        <DeltaBadge value={delta(cur, mon)} inverse={inverse} />
      </div>
    </div>
  );
}
