'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';
import { todayKey } from '@/lib/date';

type Row = {
  key: string;
  name: string;
  bodyweight: boolean;
  heaviestKg: number | null;
  bestReps: number | null;
  best1RM: number | null;
  daysSinceLast: number | null;
  weeksTrained: number;
  totals: { sessions: number; sets: number };
};

export default function ExerciseIndexPage() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch(`/api/exercises?today=${todayKey()}`)
      .then((r) => r.json() as Promise<Row[]>)
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (!rows) {
    return (
      <PageSkeleton title="Exercises" subtitle="Your lifts and their records">
        <SkeletonBlock className="h-64" />
      </PageSkeleton>
    );
  }

  return (
    <>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Exercises</h1>
        <p className="text-sm text-muted">
          Everything you&apos;ve logged, and your best on each.
        </p>
      </header>

      {rows.length === 0 && (
        <p className="card text-sm text-muted">
          Nothing logged yet. Log sets from the Today screen and your records build up here.
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.key}>
            <Link
              href={`/exercise/${encodeURIComponent(r.key)}`}
              className="card flex items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.name}</p>
                <p className="text-xs text-muted">
                  {r.totals.sessions} sessions · {r.weeksTrained} weeks ·{' '}
                  {r.daysSinceLast === 0 ? 'today' : `${r.daysSinceLast}d ago`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-lg font-bold tabular-nums">
                  {r.bodyweight ? `${r.bestReps} reps` : `${r.heaviestKg} kg`}
                </p>
                {!r.bodyweight && r.best1RM && (
                  <p className="text-xs tabular-nums text-muted">1RM ~{r.best1RM}</p>
                )}
              </div>
              <span aria-hidden className="shrink-0 text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
