'use client';

import { useCallback, useEffect, useState } from 'react';
import { DayEditor } from '@/components/DayEditor';
import { ReminderToggle } from '@/components/ReminderToggle';
import { TodaySkeleton } from '@/components/Skeleton';
import { todayKey } from '@/lib/date';
import type {
  CarriedExercise,
  Entry,
  ExerciseContext,
  PlanDay,
  Preset,
  Settings,
} from '@/lib/types';

/**
 * Rendered on the client because "today" must be the *user's* today. A server
 * render would use the deployment region's timezone, which is how trackers end
 * up logging your Tuesday morning workout against Monday.
 */
export default function TodayPage() {
  const [date, setDate] = useState<string | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [plan, setPlan] = useState<PlanDay | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [workoutContext, setWorkoutContext] = useState<
    Record<string, ExerciseContext> | undefined
  >(undefined);
  const [carried, setCarried] = useState<CarriedExercise[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const key = todayKey();
    setDate(key);

    Promise.all([
      fetch(`/api/entries/${key}`).then((r) => r.json() as Promise<Entry>),
      fetch('/api/presets').then((r) => r.json() as Promise<Preset[]>),
      fetch('/api/plan').then((r) => r.json() as Promise<PlanDay[]>),
      fetch('/api/settings').then((r) => r.json() as Promise<Settings>),
      fetch(`/api/workout-context?date=${key}`).then(
        (r) =>
          r.json() as Promise<{
            exercises: ExerciseContext[];
            carried: CarriedExercise[];
          }>,
      ),
    ])
      .then(([e, p, days, s, ctx]) => {
        setWorkoutContext(Object.fromEntries(ctx.exercises.map((x) => [x.key, x])));
        setCarried(ctx.carried ?? []);
        setEntry(e);
        setPresets(p);
        // The plan repeats weekly, so today's session is just this weekday's row.
        setPlan(days[new Date().getDay()] ?? null);
        setSettings(s);
      })
      .catch(() => setFailed(true));
  }, []);

  /** Re-reads plan progress and carried exercises after they change. */
  const refreshWorkout = useCallback(() => {
    if (!date) return;
    fetch(`/api/workout-context?date=${date}`)
      .then(
        (r) =>
          r.json() as Promise<{
            exercises: ExerciseContext[];
            carried: CarriedExercise[];
          }>,
      )
      .then((ctx) => {
        setWorkoutContext(Object.fromEntries(ctx.exercises.map((x) => [x.key, x])));
        setCarried(ctx.carried ?? []);
      })
      .catch(() => {});
  }, [date]);

  const heading = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : '';

  return (
    <>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Today</h1>
        <p className="text-sm text-muted">{heading || ' '}</p>
      </header>

      {failed && (
        <p className="card text-sm text-muted">
          Couldn&apos;t load today&apos;s entry. If you&apos;re offline, reconnect and pull
          to refresh.
        </p>
      )}

      {!entry && !failed && <TodaySkeleton />}

      {entry && date && (
        <>
          <DayEditor
            date={date}
            initialEntry={entry}
            presets={presets}
            plan={plan}
            workoutContext={workoutContext}
            carried={carried}
            onWorkoutChanged={refreshWorkout}
            settings={settings}
            showTargets
          />
          <div className="mt-4">
            <ReminderToggle />
          </div>
        </>
      )}
    </>
  );
}

