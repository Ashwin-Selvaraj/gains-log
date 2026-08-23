'use client';

type Point = { date: string; weightKg: number | null };

const W = 320;
const H = 120;
const PAD = { top: 8, right: 6, bottom: 18, left: 28 };

/**
 * Hand-rolled SVG rather than a charting library — it's one line on a small
 * screen, and a 100 KB dependency for that is a bad trade on mobile data.
 */
export function WeightChart({ data }: { data: Point[] }) {
  const points = data
    .map((d, i) => ({ ...d, i }))
    .filter((d): d is Point & { weightKg: number; i: number } => d.weightKg !== null);

  if (points.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        Log your weight on at least two days to see a trend.
      </p>
    );
  }

  const weights = points.map((p) => p.weightKg);
  // A little headroom so the line never sits flat against the frame.
  const min = Math.floor(Math.min(...weights) - 0.5);
  const max = Math.ceil(Math.max(...weights) + 0.5);
  const span = max - min || 1;

  const x = (i: number) =>
    PAD.left + (i / (data.length - 1)) * (W - PAD.left - PAD.right);
  const y = (kg: number) =>
    PAD.top + (1 - (kg - min) / span) * (H - PAD.top - PAD.bottom);

  const path = points
    .map((p, idx) => `${idx === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.weightKg).toFixed(1)}`)
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
        aria-label={`Weight trend: ${first.weightKg} kg on ${first.date} to ${last.weightKg} kg on ${last.date}`}
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
              {tick.toFixed(0)}
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
          <circle
            key={p.date}
            cx={x(p.i)}
            cy={y(p.weightKg)}
            r="2.5"
            fill="rgb(var(--accent))"
          />
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
