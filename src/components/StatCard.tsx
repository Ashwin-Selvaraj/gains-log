/** One number with a label. The unit is a separate node so it can be smaller. */
export function Stat({
  value,
  unit,
  label,
  tone = 'ink',
}: {
  value: string | number;
  unit?: string;
  label: string;
  tone?: 'ink' | 'accent' | 'muted';
}) {
  const colour =
    tone === 'accent' ? 'text-accent' : tone === 'muted' ? 'text-muted' : 'text-ink';
  return (
    <div className="min-w-0">
      <p className={`truncate text-xl font-semibold tabular-nums ${colour}`}>
        {value}
        {unit && <span className="ml-0.5 text-xs font-medium text-muted">{unit}</span>}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted">{label}</p>
    </div>
  );
}

/** A labelled proportion, drawn as a thin bar. */
export function RateBar({
  label,
  done,
  total,
}: {
  label: string;
  done: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className="tabular-nums text-muted">
          {done}
          <span className="text-xs"> / {total} days</span>
          <span className="ml-2 font-medium text-ink">{pct}%</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
