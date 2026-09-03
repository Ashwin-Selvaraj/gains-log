'use client';

import { useEffect, useState } from 'react';
import { WEEKDAY_NAMES } from '@/lib/goals';
import { mutate } from '@/lib/sync';
import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';
import { todayKey } from '@/lib/date';
import type { PlanDay } from '@/lib/types';

type Draft = { name: string; exercises: { name: string; sets: string; reps: string }[] };

const toDraft = (day: PlanDay): Draft => ({
  name: day.name,
  exercises: day.exercises.map((e) => ({
    name: e.name,
    sets: String(e.sets),
    reps: e.reps,
  })),
});

export default function PlanPage() {
  const [days, setDays] = useState<PlanDay[] | null>(null);
  // Sunday is weekday 0, but a training week reads better starting on Monday.
  const [selected, setSelected] = useState(() => new Date().getDay());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/plan?today=${todayKey()}`)
      .then((r) => r.json() as Promise<PlanDay[]>)
      .then((d) => {
        setDays(d);
        setDraft(toDraft(d[new Date().getDay()]));
      })
      .catch(() => setDays([]));
  }, []);

  /** The saved plan for the selected day, which carries this week's marks. */
  const savedDay = days?.[selected] ?? null;

  function select(weekday: number) {
    if (!days) return;
    setSelected(weekday);
    setDraft(toDraft(days[weekday]));
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      const saved = await mutate<PlanDay>('/api/plan', 'PUT', {
        weekday: selected,
        name: draft.name,
        exercises: draft.exercises
          .filter((e) => e.name.trim())
          .map((e) => ({ name: e.name, sets: Number(e.sets) || 3, reps: e.reps })),
      });
      setDays((prev) => prev!.map((d) => (d.weekday === selected ? saved : d)));
    } finally {
      setSaving(false);
    }
  }

  function editExercise(i: number, patch: Partial<Draft['exercises'][number]>) {
    setDraft((d) => ({
      ...d!,
      exercises: d!.exercises.map((e, idx) => (idx === i ? { ...e, ...patch } : e)),
    }));
  }

  if (!days || !draft) {
    return (
      <PageSkeleton title="Plan" subtitle="Your weekly split">
        <SkeletonBlock className="h-20" />
        <SkeletonBlock className="h-64" />
      </PageSkeleton>
    );
  }

  const order = [1, 2, 3, 4, 5, 6, 0]; // Monday-first

  return (
    <>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Plan</h1>
        <p className="text-sm text-muted">
          Your weekly split. It repeats every week — set it once.
        </p>
      </header>

      <div className="mb-4 grid grid-cols-7 gap-1.5">
        {order.map((weekday) => {
          const day = days[weekday];
          const active = weekday === selected;
          const rest = day.name.trim().toLowerCase() === 'rest';
          return (
            <button
              key={weekday}
              type="button"
              onClick={() => select(weekday)}
              aria-pressed={active}
              className={`flex min-h-[60px] flex-col items-center justify-center rounded-xl border
                          text-xs font-medium transition active:scale-95
                          ${
                            active
                              ? 'border-accent bg-accent/10 text-ink'
                              : 'border-line bg-card text-muted'
                          }`}
            >
              <span>{WEEKDAY_NAMES[weekday].slice(0, 3)}</span>
              {/* What actually happened this week, not just what was planned.
                  A filled tick means every planned lift was logged that day. */}
              {rest ? (
                <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-line" aria-hidden />
              ) : day.doneCount === day.exercises.length && day.exercises.length > 0 ? (
                <span className="mt-0.5 text-[0.7rem] leading-none text-accent" aria-hidden>
                  ✓
                </span>
              ) : (day.doneCount ?? 0) > 0 ? (
                <span className="mt-0.5 text-[0.6rem] leading-none text-accent tabular-nums">
                  {day.doneCount}/{day.exercises.length}
                </span>
              ) : (
                <span
                  className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                    day.upcoming ? 'bg-line' : 'bg-accent/40'
                  }`}
                  aria-hidden
                />
              )}
            </button>
          );
        })}
      </div>

      <section className="card space-y-3">
        <div>
          <label className="label" htmlFor="session-name">
            {WEEKDAY_NAMES[selected]} session
          </label>
          <input
            id="session-name"
            className="field"
            value={draft.name}
            placeholder="Push / Pull / Legs / Rest"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>

        {/* What this weekday actually looked like in the current week. The plan
            is a template with no dates, so completion only means something once
            the weekday is pinned to a real date. */}
        {savedDay && savedDay.exercises.length > 0 && (
          <p className="text-xs text-muted">
            {savedDay.upcoming
              ? `Coming up ${savedDay.date}`
              : `${savedDay.isToday ? 'Today' : savedDay.date} — ${savedDay.doneCount ?? 0} of ${savedDay.exercises.length} logged`}
          </p>
        )}

        {draft.exercises.length > 0 && (
          <ul className="space-y-2">
            {draft.exercises.map((ex, i) => {
              // Matched by position *and* name, so an edited row stops claiming
              // the previous exercise's tick before it has been saved.
              const saved = savedDay?.exercises[i];
              const mark = saved && saved.name === ex.name ? saved : null;
              return (
              <li key={i} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  title={
                    mark?.complete
                      ? 'All sets logged'
                      : mark?.done
                        ? `${mark.doneSets} of ${mark.sets} sets logged`
                        : undefined
                  }
                  className={`w-3 shrink-0 text-center text-xs ${
                    mark?.complete
                      ? 'text-accent'
                      : mark?.done
                        ? 'text-accent/60'
                        : 'text-transparent'
                  }`}
                >
                  {mark?.complete ? '✓' : mark?.done ? '◐' : '·'}
                </span>
                <input
                  className="field"
                  value={ex.name}
                  placeholder="Bench press"
                  aria-label={`Exercise ${i + 1} name`}
                  onChange={(e) => editExercise(i, { name: e.target.value })}
                />
                <input
                  className="field w-12 shrink-0 px-1 text-center"
                  inputMode="numeric"
                  value={ex.sets}
                  aria-label={`Sets for exercise ${i + 1}`}
                  onChange={(e) => editExercise(i, { sets: e.target.value })}
                />
                <input
                  className="field w-16 shrink-0 px-1 text-center"
                  value={ex.reps}
                  placeholder="8-12"
                  aria-label={`Reps for exercise ${i + 1}`}
                  onChange={(e) => editExercise(i, { reps: e.target.value })}
                />
                <button
                  type="button"
                  aria-label={`Remove exercise ${i + 1}`}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      exercises: draft.exercises.filter((_, idx) => idx !== i),
                    })
                  }
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted"
                >
                  ×
                </button>
              </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          className="btn-quiet w-full"
          onClick={() =>
            setDraft({
              ...draft,
              exercises: [...draft.exercises, { name: '', sets: '3', reps: '8-12' }],
            })
          }
        >
          + Add exercise
        </button>

        <button type="button" className="btn-primary w-full" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : `Save ${WEEKDAY_NAMES[selected]}`}
        </button>
      </section>

      <p className="mt-3 text-center text-xs text-muted">
        Columns are exercise, sets, reps. Name a day &ldquo;Rest&rdquo; to mark it off.
      </p>
    </>
  );
}
