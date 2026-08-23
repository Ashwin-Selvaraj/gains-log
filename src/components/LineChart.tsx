'use client';

export type Point = { date: string; value: number | null };

type Props = {
  data: Point[];
  /** Shown when there aren't yet two points to draw a line between. */
  emptyMessage?: string;
  /** Formats the y-axis ticks; defaults to a whole number. */
  formatValue?: (n: number) => string;
  /** Describes the series for screen readers, e.g. "Weight trend". */
  label: string;
  unit?: string;
};

const W = 320;
const H = 120;
const PAD = { top: 8, right: 6, bottom: 18, left: 30 };

/**
 * A single-series line chart in hand-written SVG.
 *
 * Shared by the weight trend and the per-exercise strength trend rather than
 * pulling in a charting library: it's one line on a small screen, and ~100 KB
 * of dependency is a bad trade on mobile data. Points with a null value are
 * gaps (a day that wasn't logged), not zeroes.
 */
export function LineChart({
  data,
  emptyMessage = 'Not enough data yet.',
  formatValue = (n) => n.toFixed(0),
  label,
  unit = '',
}: Props) {
  const points = data
    .map((d, i) => ({ ...d, i }))
    .filter((d): d is Point & { value: number; i: number } => d.value !== null);

  if (points.length < 2) {
    return <p className="py-6 text-center text-sm text-muted">{emptyMessage}</p>;
  }

  const values = points.map((p) => p.value);
  // Headroom so the line never sits flush against the frame.
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max((rawMax - rawMin) * 0.15, 0.5);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const span = max - min || 1;

  const x = (i: number) =>
    PAD.left + (data.length === 1 ? 0 : (i / (data.length - 1)) * (W - PAD.left - PAD.right));
  const y = (v: number) => PAD.top + (1 - (v - min) / span) * (H - PAD.top - PAD.bottom);

  const path = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`)
    .join(' ');

  const first = points[0];
  const last = points[points.length - 1];
  const shortDate = (key: string) => key.slice(5).replace('-', '/');

  return (
    <figure className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-32 w-full"
        role="img"
        aria-label={`${label}: ${first.value}${unit} on ${first.date} to ${last.value}${unit} on ${last.date}`}
      >
        {[max, (max + min) / 2, min].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="rgb(var(--line))"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 4}
              y={y(tick) + 3}
              textAnchor="end"
              fontSize="8"
              fill="rgb(var(--muted))"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}

        <path
          d={path}
          fill="none"
          stroke="rgb(var(--accent))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p) => (
          <circle key={p.date} cx={x(p.i)} cy={y(p.value)} r="2.5" fill="rgb(var(--accent))" />
        ))}

        <text x={PAD.left} y={H - 4} fontSize="8" fill="rgb(var(--muted))">
          {shortDate(data[0].date)}
        </text>
        <text
          x={W - PAD.right}
          y={H - 4}
          textAnchor="end"
          fontSize="8"
          fill="rgb(var(--muted))"
        >
          {shortDate(data[data.length - 1].date)}
        </text>
      </svg>
    </figure>
  );
}
