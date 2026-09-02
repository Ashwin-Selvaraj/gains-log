'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { WeightChart } from '@/components/WeightChart';
import { ScoreRing } from '@/components/ScoreRing';
import { WeekGrid } from '@/components/WeekGrid';
import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';
import { formatDay, todayKey } from '@/lib/date';
import type { Insight, WeeklyReport } from '@/lib/report';

const TONE: Record<Insight['tone'], { icon: string; ring: string; text: string }> = {
  win: { icon: '✓', ring: 'border-accent/50 bg-accent/5', text: 'text-accent' },
  watch: {
    icon: '!',
    ring: 'border-amber-500/40 bg-amber-500/5',
    text: 'text-amber-700 dark:text-amber-400',
  },
  miss: {
    icon: '↓',
    ring: 'border-red-500/40 bg-red-500/5',
    text: 'text-red-600 dark:text-red-400',
  },
};

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

  if (!report) {
    return (
      <PageSkeleton title="Weekly Report" subtitle="Last 7 days">
        <SkeletonBlock className="h-44" />
        <SkeletonBlock className="h-56" />
        <SkeletonBlock className="h-64" />
      </PageSkeleton>
    );
  }

  const { score, weight, training, nutrition, habits, sleep, water, meetings, insights, days, trend } =
    report;
  const today = todayKey();
  const gaining = weight.change !== null && weight.change > 0;

  return (
    <>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Weekly Report</h1>
        <p className="text-sm text-muted">
          {formatDay(report.window.from, today)} → {formatDay(report.window.to, today)}
        </p>
      </header>

      {/* ── Verdict ───────────────────────────────────────────────────── */}
      <section className="card mb-4">
        <div className="flex items-center gap-4">
          <ScoreRing total={score.total} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold leading-snug">{score.verdict}</p>
            <ul className="mt-3 space-y-1.5">
              {score.parts.map((p) => (
                <li key={p.label} className="text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted">{p.label}</span>
                    <span className="tabular-nums">
                      {p.score}/{p.max}
                    </span>
                  </div>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${(p.score / p.max) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-3 border-t border-line pt-2 text-[11px] text-muted">
          Score is training 30 · habits 25 · protein 25 · plan followed 20. Every part is
          shown above, so it&apos;s never a number you have to take on faith.
        </p>
      </section>

      {/* ── What to fix ───────────────────────────────────────────────── */}
      {insights.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-base font-semibold">This week in short</h2>
          <ul className="space-y-2">
            {insights.map((i, idx) => {
              const tone = TONE[i.tone];
              return (
                <li key={idx} className={`rounded-2xl border p-3 ${tone.ring}`}>
                  <div className="flex gap-2.5">
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${tone.ring} ${tone.text}`}
                    >
                      {tone.icon}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${tone.text}`}>{i.title}</p>
                      <p className="text-xs text-muted">{i.detail}</p>
                      {i.action && (
                        <p className="mt-1 text-xs font-medium">→ {i.action}</p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── The week at a glance ──────────────────────────────────────── */}
      <section className="card mb-4">
        <h2 className="mb-3 text-base font-semibold">Day by day</h2>
        <WeekGrid days={days} proteinTarget={nutrition.proteinTarget} />
      </section>

      {/* ── Weight ────────────────────────────────────────────────────── */}
      <section className="card mb-4">
        <h2 className="mb-3 text-base font-semibold">Weight</h2>

        <div className="mb-4 flex items-end gap-4">
          <div>
            <p className="text-3xl font-bold tabular-nums">
              {weight.avg7 ?? '—'}
              <span className="ml-1 text-base font-normal text-muted">kg avg</span>
            </p>
            {weight.change !== null && (
              <p className={`text-sm tabular-nums ${gaining ? 'text-accent' : 'text-muted'}`}>
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

        {/* A trend line beats a week-on-week delta: bodyweight swings a kilo on
            water alone, so the fitted rate is the number worth acting on. */}
        {weight.ratePerWeek !== null && (
          <p className="mt-3 border-t border-line pt-3 text-sm">
            <span className="text-muted">Trending </span>
            <strong className="tabular-nums">
              {weight.ratePerWeek > 0 ? '+' : ''}
              {weight.ratePerWeek} kg/week
            </strong>
            {weight.projectedDate ? (
              <span className="text-muted">
                {' '}
                · on pace for {weight.goal} kg around{' '}
                <strong className="text-ink">{weight.projectedDate}</strong>
              </span>
            ) : (
              <span className="text-muted"> · not gaining yet, so no projection</span>
            )}
          </p>
        )}

        <div className="mt-3">
          <WeightChart data={trend} />
        </div>
      </section>

      {/* ── Training ──────────────────────────────────────────────────── */}
      <section className="card mb-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Training</h2>
          <p className="text-sm tabular-nums text-muted">
            {training.sessions}/{training.sessionGoal} sessions
          </p>
        </div>

        {training.totalSets === 0 ? (
          <p className="py-2 text-sm text-muted">
            No sets logged this week. Log them from Today and this fills in.
          </p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <Metric
                label="Volume"
                value={`${(training.volumeKg / 1000).toFixed(1)}t`}
                sub={
                  training.prevVolumeKg > 0
                    ? `${training.volumeKg >= training.prevVolumeKg ? '▲' : '▼'} ${Math.abs(
                        training.volumeKg - training.prevVolumeKg,
                      ).toLocaleString()} kg`
                    : 'first week'
                }
                good={training.volumeKg >= training.prevVolumeKg}
              />
              <Metric label="Sets" value={String(training.totalSets)} sub="logged" />
              <Metric
                label="Plan"
                value={`${training.adherence.pct}%`}
                sub={`${training.adherence.completed}/${training.adherence.planned}`}
                good={training.adherence.pct >= 80}
              />
            </div>

            {training.prs.length > 0 && (
              <div className="mb-3 rounded-xl border border-accent/40 bg-accent/5 p-3">
                <p className="mb-1.5 text-sm font-semibold text-accent">
                  🏆 {training.prs.length} record{training.prs.length === 1 ? '' : 's'} broken
                </p>
                {/* Capped: early on, when every load is a first, this list can
                    run to twenty-odd chips and drown the card it is meant to
                    celebrate. The count above already tells the full story. */}
                <ul className="flex flex-wrap gap-1.5">
                  {training.prs.slice(0, 8).map((pr, i) => (
                    <li
                      key={`${pr.key}-${i}`}
                      className="rounded-full border border-accent/40 bg-card px-2.5 py-1 text-xs tabular-nums"
                    >
                      <strong>{pr.exercise}</strong>{' '}
                      {pr.weightKg === null
                        ? `${pr.reps} reps`
                        : `${pr.reps} × ${pr.weightKg}kg`}
                    </li>
                  ))}
                  {training.prs.length > 8 && (
                    <li className="px-2.5 py-1 text-xs text-muted">
                      +{training.prs.length - 8} more
                    </li>
                  )}
                </ul>
              </div>
            )}

            {training.missedSessions.length > 0 && (
              <div className="mb-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
                <p className="mb-1 text-sm font-semibold text-amber-700 dark:text-amber-400">
                  Missed this week
                </p>
                <ul className="space-y-0.5 text-xs text-muted">
                  {training.missedSessions.map((m) => (
                    <li key={m.date}>
                      <strong className="text-ink">{formatDay(m.date, today)}</strong> ·{' '}
                      {m.name} — {m.missed.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ul className="divide-y divide-line">
              {training.exercises.map((ex) => (
                <li key={ex.key} className="flex items-center gap-3 py-2">
                  <Link
                    href={`/exercise/${encodeURIComponent(ex.key)}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium"
                  >
                    {ex.name}
                  </Link>
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
          </>
        )}
      </section>

      {/* ── Nutrition ─────────────────────────────────────────────────── */}
      <section className="card mb-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Nutrition</h2>
          <p className="text-sm text-muted">
            {nutrition.daysWithMeals}/7 days logged
          </p>
        </div>

        {nutrition.daysWithMeals === 0 ? (
          <p className="py-2 text-sm text-muted">No meals logged this week.</p>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <Metric
                label="Avg protein"
                value={`${nutrition.avgProtein} g`}
                sub={`target ${nutrition.proteinTarget} · hit ${nutrition.proteinHitDays}/7`}
                good={(nutrition.avgProtein ?? 0) >= nutrition.proteinTarget}
              />
              <Metric
                label="Avg calories"
                value={nutrition.avgCalories?.toLocaleString() ?? '—'}
                sub={`target ${nutrition.calorieTarget[0].toLocaleString()}–${nutrition.calorieTarget[1].toLocaleString()} · hit ${nutrition.calorieHitDays}/7`}
                good={(nutrition.avgCalories ?? 0) >= nutrition.calorieTarget[0]}
              />
            </div>

            <p className="text-xs tabular-nums text-muted">
              Carbs {nutrition.avgCarbs} g · Fat {nutrition.avgFat} g · Fibre{' '}
              {nutrition.avgFiber} g — daily average
            </p>

            {nutrition.bestProteinDay && (
              <p className="mt-2 border-t border-line pt-2 text-xs text-muted">
                Best day:{' '}
                <strong className="text-ink">
                  {formatDay(nutrition.bestProteinDay.date, today)}
                </strong>{' '}
                at {nutrition.bestProteinDay.protein} g protein
              </p>
            )}

            {nutrition.daysWithMeals < 7 && (
              <p className="mt-1 text-xs text-muted">
                Averages cover only the {nutrition.daysWithMeals} logged day
                {nutrition.daysWithMeals === 1 ? '' : 's'}.
              </p>
            )}
          </>
        )}
      </section>

      {/* ── Habits ────────────────────────────────────────────────────── */}
      <section className="card mb-4">
        <h2 className="mb-3 text-base font-semibold">Habits</h2>
        <ul className="space-y-3">
          {habits.map((h) => (
            <li key={h.key}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium">
                  {h.label}
                  {h.streak >= 3 && (
                    <span className="ml-1.5 text-xs font-normal text-accent">
                      🔥 {h.streak}-day streak
                    </span>
                  )}
                </span>
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

      <section className="mb-4 grid grid-cols-3 gap-3">
        <Metric
          label="Avg sleep"
          value={sleep.avgHours === null ? '—' : `${sleep.avgHours}h`}
          sub={`${sleep.nightsLogged} logged`}
          good={(sleep.avgHours ?? 0) >= 7}
        />
        <Metric
          label="Avg water"
          value={water.avgLitres === null ? '—' : `${water.avgLitres}L`}
          sub={`${water.daysLogged} logged`}
        />
        <Metric label="Meetings" value={String(meetings.total)} sub="this week" />
      </section>

      {/* Icon over label rather than beside it: three side-by-side buttons with
          emoji + word wrap on a narrow phone, and a wrapped button looks broken. */}
      <div className="grid grid-cols-3 gap-2">
        <Link href="/exercise" className="btn-quiet !flex-col gap-0.5 py-2 text-xs">
          <span aria-hidden className="text-base leading-none">🏋️</span>
          Exercises
        </Link>
        <Link href="/goals" className="btn-quiet !flex-col gap-0.5 py-2 text-xs">
          <span aria-hidden className="text-base leading-none">🎯</span>
          Goals
        </Link>
        <a href="/api/export" className="btn-quiet !flex-col gap-0.5 py-2 text-xs" download>
          <span aria-hidden className="text-base leading-none">⬇</span>
          Export CSV
        </a>
      </div>
    </>
  );
}

function Metric({
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
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${good ? 'text-accent' : ''}`}>{value}</p>
      <p className="text-[11px] leading-tight text-muted">{sub}</p>
    </div>
  );
}
