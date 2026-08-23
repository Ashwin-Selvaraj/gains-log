'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { ExerciseContext, PlanDay, WorkoutSet } from '@/lib/types';

type Props = {
  /** The session assigned to this weekday, or null if the plan isn't set up. */
  plan: PlanDay | null;
  sets: WorkoutSet[];
  /** Last session + standing records per exercise key; absent while loading. */
  context?: Record<string, ExerciseContext>;
  onLogSet: (set: { exercise: string; reps: number; weightKg: number | null }) => void;
  onRemoveSet: (id: string) => void;
};

/** Same normalisation as exerciseKey() on the server. */
const keyOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

const volumeOf = (sets: WorkoutSet[]) =>
  Math.round(sets.reduce((sum, s) => sum + s.reps * (s.weightKg ?? 0), 0));

/**
 * Defined at module scope, not inside WorkoutCard. Nesting it would make React
 * see a brand-new component type on every keystroke, unmount the subtree, and
 * yank focus out of the reps field mid-set.
 */
function ExerciseRow({
  name,
  target,
  context,
  done,
  expanded,
  onToggle,
  reps,
  weight,
  onRepsChange,
  onWeightChange,
  onLog,
  onRemoveSet,
}: {
  name: string;
  target?: { sets: number; reps: string };
  context?: ExerciseContext;
  done: WorkoutSet[];
  expanded: boolean;
  onToggle: () => void;
  reps: string;
  weight: string;
  onRepsChange: (v: string) => void;
  onWeightChange: (v: string) => void;
  onLog: () => void;
  onRemoveSet: (id: string) => void;
}) {
  const complete = target ? done.length >= target.sets : done.length > 0;

  // What you lifted last time and what you have to beat — the two things you
  // can't remember standing at the rack.
  const lastSummary = context?.last
    ? context.last.sets
        .map((s) => (s.weightKg === null ? `${s.reps}` : `${s.reps}×${s.weightKg}`))
        .join(', ')
    : null;

  const best = context?.bodyweight
    ? context.bestReps !== null
      ? `${context.bestReps} reps`
      : null
    : context?.heaviestKg !== null && context?.heaviestKg !== undefined
      ? `${context.heaviestKg} kg`
      : null;

  // Did anything logged today beat the standing record?
  const beatToday = context
    ? context.bodyweight
      ? done.some((d) => d.reps > (context.bestReps ?? 0))
      : done.some((d) => (d.weightKg ?? 0) > (context.heaviestKg ?? 0))
    : false;

  return (
    <li className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 py-3 text-left"
      >
        <span
          aria-hidden
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full
                      text-xs font-bold ${
                        complete ? 'bg-accent text-white' : 'border border-line text-muted'
                      }`}
        >
          {complete ? '✓' : done.length || ''}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {name}
            {beatToday && (
              <span className="ml-1.5 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                PR
              </span>
            )}
          </span>
          <span className="block text-xs tabular-nums text-muted">
            {target && `target ${target.sets}×${target.reps}`}
            {target && done.length > 0 && ' · '}
            {done.length > 0 &&
              done
                .map((s) => `${s.reps}${s.weightKg ? `×${s.weightKg}` : ''}`)
                .join(', ')}
            {!target && done.length === 0 && 'extra'}
          </span>

          {(lastSummary || best) && (
            <span className="mt-0.5 block text-xs tabular-nums text-muted">
              {lastSummary && (
                <>
                  Last: {lastSummary}
                  {context?.daysSince !== null && context?.daysSince !== undefined && (
                    <> · {context.daysSince}d ago</>
                  )}
                </>
              )}
              {lastSummary && best && ' · '}
              {best && <>Best {best}</>}
            </span>
          )}
        </span>

        <span
          aria-hidden
          className={`text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
        >
          ›
        </span>
      </button>

      {expanded && (
        <div className="pb-3">
          <div className="flex gap-2">
            <input
              className="field text-center"
              inputMode="numeric"
              placeholder="reps"
              aria-label={`Reps for ${name}`}
              value={reps}
              onChange={(e) => onRepsChange(e.target.value)}
            />
            <input
              className="field text-center"
              inputMode="decimal"
              placeholder="kg"
              aria-label={`Weight for ${name}`}
              value={weight}
              onChange={(e) => onWeightChange(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary shrink-0 px-5"
              disabled={!reps}
              onClick={onLog}
            >
              Log
            </button>
          </div>

          {context && (
            <Link
              href={`/exercise/${encodeURIComponent(keyOf(name))}`}
              className="mt-2 inline-block text-xs font-medium text-accent"
            >
              Full history &amp; records →
            </Link>
          )}

          {done.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {done.map((s, i) => (
                <li
                  key={s.id}
                  className="flex items-center gap-1 rounded-full border border-line
                             bg-surface py-1 pl-2.5 pr-1 text-xs tabular-nums"
                >
                  <span className="text-muted">#{i + 1}</span>
                  {s.reps} reps{s.weightKg ? ` × ${s.weightKg}kg` : ''}
                  <button
                    type="button"
                    onClick={() => onRemoveSet(s.id)}
                    aria-label={`Remove set ${i + 1} of ${name}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full text-muted"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Plan on the left, reality on the right. Planned exercises come from the weekly
 * split; tapping one opens a two-field logger, because mid-session you want reps
 * and weight in two taps, not a form.
 */
export function WorkoutCard({ plan, sets, context, onLogSet, onRemoveSet }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  // Exercises named by hand that have no sets yet — without this they'd vanish
  // the instant you added them.
  const [adHoc, setAdHoc] = useState<string[]>([]);

  const byExercise = useMemo(() => {
    const map = new Map<string, WorkoutSet[]>();
    for (const s of sets) {
      const list = map.get(s.exercise) ?? [];
      list.push(s);
      map.set(s.exercise, list);
    }
    return map;
  }, [sets]);

  // Anything logged today that isn't in the plan — a swapped machine, a
  // finisher. It still counts, so it still shows.
  const extras = useMemo(() => {
    const planned = new Set((plan?.exercises ?? []).map((e) => e.name));
    const seen = new Set([...byExercise.keys(), ...adHoc]);
    return [...seen].filter((name) => !planned.has(name));
  }, [byExercise, plan, adHoc]);

  function submit(exercise: string) {
    const r = Number(reps);
    if (!Number.isFinite(r) || r < 1) return;
    onLogSet({
      exercise,
      reps: Math.round(r),
      weightKg: weight === '' ? null : Number(weight),
    });
    setReps('');
    // Weight is deliberately kept — the next set is usually the same load.
  }

  const isRest = !plan || plan.name.trim().toLowerCase() === 'rest';
  const totalVolume = volumeOf(sets);

  const rowProps = (name: string) => ({
    name,
    context: context?.[keyOf(name)],
    done: byExercise.get(name) ?? [],
    expanded: open === name,
    onToggle: () => setOpen(open === name ? null : name),
    reps,
    weight,
    onRepsChange: setReps,
    onWeightChange: setWeight,
    onLog: () => submit(name),
    onRemoveSet,
  });

  return (
    <section className="card space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="min-w-0 truncate text-base font-semibold">
          {isRest ? 'Rest day' : plan.name}
          <span className="ml-2 text-xs font-normal text-muted">today&apos;s plan</span>
        </h2>
        {sets.length > 0 && (
          <p className="shrink-0 text-sm tabular-nums text-muted">
            {sets.length} sets · {totalVolume.toLocaleString()} kg
          </p>
        )}
      </div>

      {isRest && sets.length === 0 && (
        <p className="py-2 text-sm text-muted">
          Nothing scheduled today. Set your split on the Plan tab — or log something
          anyway below.
        </p>
      )}

      <ul>
        {(plan?.exercises ?? []).map((e) => (
          <ExerciseRow
            key={e.id || e.name}
            {...rowProps(e.name)}
            target={{ sets: e.sets, reps: e.reps }}
          />
        ))}
        {extras.map((name) => (
          <ExerciseRow key={name} {...rowProps(name)} />
        ))}
      </ul>

      <AddExtra
        onAdd={(name) => {
          setAdHoc((prev) => (prev.includes(name) ? prev : [...prev, name]));
          setOpen(name);
        }}
        known={[...byExercise.keys()]}
      />
    </section>
  );
}

/** Lets you log something the plan didn't ask for without editing the plan. */
function AddExtra({ onAdd, known }: { onAdd: (name: string) => void; known: string[] }) {
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn-quiet mt-2 w-full" onClick={() => setOpen(true)}>
        + Log another exercise
      </button>
    );
  }

  return (
    <form
      className="mt-2 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        onAdd(trimmed);
        setName('');
        setOpen(false);
      }}
    >
      <input
        className="field"
        placeholder="Exercise name"
        aria-label="Exercise name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        list="known-exercises"
        autoFocus
      />
      <datalist id="known-exercises">
        {known.map((k) => (
          <option key={k} value={k} />
        ))}
      </datalist>
      <button type="submit" className="btn-quiet shrink-0" disabled={!name.trim()}>
        Add
      </button>
    </form>
  );
}
