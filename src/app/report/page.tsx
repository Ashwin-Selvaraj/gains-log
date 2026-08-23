'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { WeightChart } from '@/components/WeightChart';
import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';
import { todayKey } from '@/lib/date';
import type { WeeklyReport } from '@/lib/report';

export default function ReportPage() {
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/report?today=${todayKey()}`)
      .then((r) => r.json() as Promise<WeeklyReport>)
      .then(setReport)
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return (
      <PageSkeleton title="Weekly Report">
        <p className="card text-sm text-muted">Couldn&apos;t load the report.</p>
      </PageSkeleton>
    );
  }

  // Header stays put so this reads as the same screen filling in, not a swap.
  if (!report) {
    return (
      <PageSkeleton title="Weekly Report" subtitle="Last 7 days">
        <SkeletonBlock className="h-44" />
        <SkeletonBlock className="h-48" />
        <SkeletonBlock className="h-64" />
      </PageSkeleton>
    );
  }

  const { weight, habits, sleep, meetings, nutrition, trend, workouts } = report;
  const gaining = weight.change !== null && weight.change > 0;

  return (
    <>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Weekly Report</h1>
        <p className="text-sm text-muted">
          {report.window.from} → {report.window.to}
        </p>
      </header>

      <section className="card mb-4">
        <h2 className="mb-3 text-base font-semibold">Weight</h2>

        <div className="mb-4 flex items-end gap-4">
          <div>
            <p className="text-3xl font-bold tabular-nums">
              {weight.avg7 ?? '—'}
              <span className="ml-1 text-base font-normal text-muted">kg avg</span>
            </p>
            {weight.change !== null && (
              <p
                className={`text-sm tabular-nums ${gaining ? 'text-accent' : 'text-muted'}`}
              >
                {weight.change > 0 ? '▲' : weight.change < 0 ? '▼' : '='}{' '}
                {Math.abs(weight.change)} kg vs. previous 7 days
              </p>
            )}
          </div>
          <div className="ml-auto text-right">
            <p className="text-sm text-muted">To goal</p>
            <p className="text-xl font-semibold tabular-nums">
              {weight.remaining === null
                ? '—'
                : weight.remaining <= 0
                  ? 'Reached 🎉'
                  : `${weight.remaining} kg`}
            </p>
          </div>
        </div>

        {weight.progress !== null && (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${weight.progress * 100}%` }}
              />
            </div>
            <p className="mt-1 flex justify-between text-xs tabular-nums text-muted">
              <span>{weight.start} kg start</span>
              <span>{weight.goal} kg goal</span>
            </p>
          </>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="mb-3 text-base font-semibold">Trend (4 weeks)</h2>
        <WeightChart data={trend} />
      </section>

      <section className="card mb-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Training (last 7 days)</h2>
          <p className="text-sm tabular-nums text-muted">
            {workouts.sessions}/{workouts.sessionGoal} sessions
          </p>
        </div>

        {workouts.totalSets === 0 ? (
          <p className="py-2 text-sm text-muted">
            No sets logged this week. Log them from the Today screen and this fills in.
          </p>
        ) : (
          <>
            <div className="mb-4 flex items-end gap-4">
              <div>
                <p className="text-3xl font-bold tabular-nums">
                  {workouts.volumeKg.toLocaleString()}
                  <span className="ml-1 text-base font-normal text-muted">kg volume</span>
                </p>
                {workouts.prevVolumeKg > 0 && (
                  <p
                    className={`text-sm tabular-nums ${
                      workouts.volumeKg >= workouts.prevVolumeKg
                        ? 'text-accent'
                        : 'text-muted'
                    }`}
                  >
                    {workouts.volumeKg >= workouts.prevVolumeKg ? '▲' : '▼'}{' '}
                    {Math.abs(
                      workouts.volumeKg - workouts.prevVolumeKg,
                    ).toLocaleString()}{' '}
                    kg vs. previous 7 days
                  </p>
                )}
              </div>
              <p className="ml-auto text-right text-sm text-muted">
                {workouts.totalSets} sets
              </p>
            </div>

            <ul className="divide-y divide-line">
              {workouts.exercises.map((ex) => (
                <li key={ex.name} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {ex.name}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {ex.sets} sets
                  </span>
                  <span className="w-20 shrink-0 text-right text-sm tabular-nums">
                    {ex.topWeightKg === null ? '—' : `${ex.topWeightKg} kg`}
                  </span>
                  <span
                    className={`w-14 shrink-0 text-right text-xs tabular-nums ${
                      ex.deltaKg === null
                        ? 'text-muted'
                        : ex.deltaKg > 0
                          ? 'text-accent'
                          : ex.deltaKg < 0
                            ? 'text-red-500'
                            : 'text-muted'
                    }`}
                  >
                    {ex.deltaKg === null
                      ? 'new'
                      : ex.deltaKg === 0
                        ? '='
                        : `${ex.deltaKg > 0 ? '+' : ''}${ex.deltaKg}`}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Heaviest set per exercise, and the change against last week.
            </p>

            {workouts.prs.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <h3 className="mb-2 text-sm font-semibold">
                  🏆 Records broken this week
                </h3>
                <ul className="flex flex-wrap gap-1.5">
                  {workouts.prs.map((pr, i) => (
                    <li
                      key={`${pr.key}-${i}`}
                      className="rounded-full border border-accent bg-accent/10 px-2.5 py-1
                                 text-xs tabular-nums"
                    >
                      <strong>{pr.exercise}</strong>{' '}
                      {pr.weightKg === null
                        ? `${pr.reps} reps`
                        : `${pr.reps} × ${pr.weightKg}kg`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <section className="card mb-4">
        <h2 className="mb-3 text-base font-semibold">Habits (last 7 days)</h2>
        <ul className="space-y-3">
          {habits.map((h) => (
            <li key={h.key}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium">{h.label}</span>
                <span className="tabular-nums text-muted">
                  {h.days}/7 · {h.pct}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${h.pct}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-4 grid grid-cols-2 gap-3">
        <Stat
          label="Avg sleep"
          value={sleep.avgHours === null ? '—' : `${sleep.avgHours} h`}
          sub={`${sleep.nightsLogged} night${sleep.nightsLogged === 1 ? '' : 's'} logged`}
        />
        <Stat
          label="Meetings"
          value={String(meetings.total)}
          sub="logged this week"
        />
        <Stat
          label="Avg protein"
          value={nutrition.avgProtein === null ? '—' : `${nutrition.avgProtein} g`}
          sub={`target ${nutrition.proteinTarget} g`}
          good={
            nutrition.avgProtein !== null &&
            nutrition.avgProtein >= nutrition.proteinTarget
          }
        />
        <Stat
          label="Avg calories"
          value={
            nutrition.avgCalories === null
              ? '—'
              : nutrition.avgCalories.toLocaleString()
          }
          sub={`target ${nutrition.calorieTarget[0].toLocaleString()}–${nutrition.calorieTarget[1].toLocaleString()}`}
          good={
            nutrition.avgCalories !== null &&
            nutrition.avgCalories >= nutrition.calorieTarget[0]
          }
        />
      </section>

      {nutrition.daysWithMeals < 7 && (
        <p className="mb-4 text-center text-xs text-muted">
          Nutrition averages cover the {nutrition.daysWithMeals} day
          {nutrition.daysWithMeals === 1 ? '' : 's'} with logged meals.
        </p>
      )}

      <div className="flex gap-2">
        <Link href="/exercise" className="btn-quiet flex-1">
          🏋️ Exercises
        </Link>
        <Link href="/goals" className="btn-quiet flex-1">
          🎯 Goals
        </Link>
        <a href="/api/export" className="btn-quiet flex-1" download>
          ⬇ Export CSV
        </a>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  good,
}: {
  label: string;
  value: string;
  sub: string;
  good?: boolean;
}) {
  return (
    <div className="card">
      <p className="text-sm text-muted">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${good ? 'text-accent' : ''}`}>
        {value}
      </p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}
