'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { LineChart } from '@/components/LineChart';
import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';
import { formatDay, todayKey } from '@/lib/date';

type PRKind = 'heaviest' | 'e1rm' | 'reps';

type Detail = {
  records: {
    key: string;
    name: string;
    bodyweight: boolean;
    heaviest: { weightKg: number; reps: number; date: string } | null;
    best1RM: { est1RM: number; weightKg: number; reps: number; date: string } | null;
    bestReps: { reps: number; date: string } | null;
    bestPerRep: { minReps: number; mark: { weightKg: number; reps: number; date: string } }[];
    totals: { sessions: number; sets: number; reps: number; volumeKg: number };
    firstDate: string | null;
    daysSinceLast: number | null;
    weeksTrained: number;
    weekStreak: number;
  };
  series: { date: string; value: number }[];
  seriesLabel: string;
  sessions: {
    date: string;
    volumeKg: number;
    sets: { id: string; reps: number; weightKg: number | null; prs: PRKind[] }[];
  }[];
};

/** "today" / "yesterday" read wrong after "on"; a date reads wrong without it. */
function whenPhrase(date: string, today: string): string {
  const label = formatDay(date, today);
  return label === 'Today' || label === 'Yesterday'
    ? label.toLowerCase()
    : `on ${label}`;
}

const PR_LABEL: Record<PRKind, string> = {
  heaviest: 'Heaviest',
  e1rm: 'Best 1RM',
  reps: 'Most reps',
};

export default function ExercisePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/exercises/${key}?today=${todayKey()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'Not found');
        return r.json() as Promise<Detail>;
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [key]);

  if (error) {
    return (
      <PageSkeleton title="Exercise">
        <p className="card text-sm text-muted">{error}</p>
        <Link href="/exercise" className="btn-quiet w-full">
          ← All exercises
        </Link>
      </PageSkeleton>
    );
  }

  if (!data) {
    return (
      <PageSkeleton title="Exercise" subtitle="Loading records">
        <SkeletonBlock className="h-40" />
        <SkeletonBlock className="h-44" />
        <SkeletonBlock className="h-64" />
      </PageSkeleton>
    );
  }

  const { records: r, sessions, series, seriesLabel } = data;
  const today = todayKey();

  return (
    <>
      <header className="mb-4">
        <Link href="/exercise" className="text-sm text-muted">
          ← All exercises
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{r.name}</h1>
        <p className="text-sm text-muted">
          {r.daysSinceLast === 0
            ? 'Trained today'
            : r.daysSinceLast === 1
              ? 'Trained yesterday'
              : `Last trained ${r.daysSinceLast} days ago`}
        </p>
      </header>

      {/* Headline record */}
      <section className="card mb-4">
        {r.bodyweight ? (
          <>
            <p className="text-sm text-muted">Best set</p>
            <p className="text-4xl font-bold tabular-nums">
              {r.bestReps?.reps}
              <span className="ml-1 text-base font-normal text-muted">reps</span>
            </p>
            <p className="text-sm text-muted">
              {r.bestReps && whenPhrase(r.bestReps.date, today)}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Heaviest ever</p>
            <p className="text-4xl font-bold tabular-nums">
              {r.heaviest?.weightKg}
              <span className="ml-1 text-base font-normal text-muted">kg</span>
            </p>
            <p className="text-sm text-muted">
              for {r.heaviest?.reps} reps {r.heaviest && whenPhrase(r.heaviest.date, today)}
            </p>
            {r.best1RM && (
              <p className="mt-3 border-t border-line pt-3 text-sm">
                <span className="text-muted">Estimated 1RM</span>{' '}
                <strong className="tabular-nums">{r.best1RM.est1RM} kg</strong>{' '}
                <span className="text-muted">
                  from {r.best1RM.weightKg} × {r.best1RM.reps}
                </span>
              </p>
            )}
          </>
        )}
      </section>

      <section className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Weeks trained" value={String(r.weeksTrained)} sub={`${r.weekStreak}-week streak`} />
        <Stat label="Sessions" value={String(r.totals.sessions)} sub={`${r.totals.sets} sets`} />
        <Stat label="Total reps" value={r.totals.reps.toLocaleString()} sub="all time" />
        <Stat
          label="Total volume"
          value={r.totals.volumeKg > 0 ? `${(r.totals.volumeKg / 1000).toFixed(1)}t` : '—'}
          sub={r.firstDate ? `since ${r.firstDate}` : ''}
        />
      </section>

      <section className="card mb-4">
        <h2 className="mb-3 text-base font-semibold">{seriesLabel}</h2>
        <LineChart
          data={series}
          label={seriesLabel}
          formatValue={(n) => n.toFixed(r.bodyweight ? 0 : 1)}
          emptyMessage="Train this on two separate days to see a trend."
        />
      </section>

      {r.bestPerRep.length > 0 && (
        <section className="card mb-4">
          <h2 className="mb-1 text-base font-semibold">Best per rep range</h2>
          <p className="mb-3 text-xs text-muted">
            Heaviest load you&apos;ve carried for at least this many reps.
          </p>
          <ul className="divide-y divide-line">
            {r.bestPerRep.map((b) => (
              <li key={b.minReps} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-14 shrink-0 font-medium tabular-nums">
                  {b.minReps}+ reps
                </span>
                <span className="flex-1 tabular-nums">
                  <strong>{b.mark.weightKg} kg</strong>{' '}
                  <span className="text-muted">× {b.mark.reps}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {formatDay(b.mark.date, today)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="mb-3 text-base font-semibold">Every session</h2>
        <ul className="divide-y divide-line">
          {sessions.map((s) => (
            <li key={s.date} className="py-3">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-sm font-medium">{formatDay(s.date, today)}</span>
                {s.volumeKg > 0 && (
                  <span className="text-xs tabular-nums text-muted">
                    {s.volumeKg.toLocaleString()} kg
                  </span>
                )}
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {s.sets.map((set) => (
                  <li
                    key={set.id}
                    className={`rounded-full border px-2.5 py-1 text-xs tabular-nums ${
                      set.prs.length
                        ? 'border-accent bg-accent/10 font-medium'
                        : 'border-line bg-surface'
                    }`}
                    title={set.prs.map((k) => PR_LABEL[k]).join(', ')}
                  >
                    {set.weightKg === null
                      ? `${set.reps} reps`
                      : `${set.reps} × ${set.weightKg}kg`}
                    {set.prs.length > 0 && (
                      <span className="ml-1 text-accent" aria-label="personal record">
                        PR
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}
