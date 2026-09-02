'use client';

/**
 * The week's score as a ring. Drawn with a stroke-dasharray arc rather than a
 * chart library — it's one circle, and the whole point of this screen is that
 * it loads instantly on a phone.
 */
export function ScoreRing({ total }: { total: number }) {
  const size = 132;
  const stroke = 11;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, total)) / 100;

  // Green when it's a good week, amber when it's mixed, muted when it isn't —
  // the number alone doesn't communicate fast enough to be glanced at.
  const colour =
    total >= 70
      ? 'rgb(var(--accent))'
      : total >= 45
        ? 'rgb(217 160 60)'
        : 'rgb(var(--muted))';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--line))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.2,0.8,0.3,1)' }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums leading-none">{total}</span>
        <span className="mt-1 text-[11px] uppercase tracking-wide text-muted">/ 100</span>
      </div>
    </div>
  );
}
