'use client';

import type { DaySnapshot } from '@/lib/report';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/**
 * The week at a glance: one column per day, one dot per habit.
 *
 * Sits above the per-metric breakdowns because the shape of a week — a solid
 * block then three blank days — tells you more in one look than four separate
 * percentages do.
 */
export function WeekGrid({ days, proteinTarget }: { days: DaySnapshot[]; proteinTarget: number }) {
  const rows = [
    { label: 'Workout', get: (d: DaySnapshot) => d.workoutDone },
    { label: 'Water', get: (d: DaySnapshot) => d.waterDone },
    { label: 'Learning', get: (d: DaySnapshot) => d.learningDone },
    { label: 'Slept well', get: (d: DaySnapshot) => d.sleptWell },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[300px] border-separate border-spacing-y-1 text-xs">
        <thead>
          <tr>
            <th className="w-20" />
            {days.map((d) => {
              const dow = new Date(`${d.date}T00:00:00`).getDay();
              return (
                <th key={d.date} className="pb-1 text-center font-medium text-muted">
                  <span className="block">{DOW[dow]}</span>
                  <span className="block text-[10px] font-normal opacity-70">
                    {d.date.slice(8)}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="pr-2 text-muted">{row.label}</td>
              {days.map((d) => (
                <td key={d.date} className="text-center">
                  <span
                    className={`inline-block h-5 w-5 rounded-md ${
                      row.get(d) ? 'bg-accent' : d.empty ? 'bg-line/40' : 'bg-line'
                    }`}
                    title={`${row.label} — ${d.date}${row.get(d) ? ' ✓' : ''}`}
                  />
                </td>
              ))}
            </tr>
          ))}

          {/* Numbers, not ticks: protein and sets are the two that carry the week. */}
          <tr>
            <td className="pr-2 pt-1 text-muted">Protein</td>
            {days.map((d) => (
              <td
                key={d.date}
                className={`pt-1 text-center tabular-nums ${
                  d.protein >= proteinTarget
                    ? 'font-semibold text-accent'
                    : d.protein > 0
                      ? 'text-ink'
                      : 'text-muted/50'
                }`}
              >
                {d.protein || '—'}
              </td>
            ))}
          </tr>
          <tr>
            <td className="pr-2 text-muted">Sets</td>
            {days.map((d) => (
              <td
                key={d.date}
                className={`text-center tabular-nums ${d.sets > 0 ? 'text-ink' : 'text-muted/50'}`}
              >
                {d.sets || '—'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
