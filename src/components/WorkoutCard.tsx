'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  CarriedExercise,
  ExerciseContext,
  PlanDay,
  PlanProgress,
  WorkoutSet,
} from '@/lib/types';
import { CarryForward } from '@/components/CarryForward';
import { ExercisePicker } from '@/components/ExercisePicker';
import { MUSCLE_GROUPS, muscleGroupLabel } from '@/lib/exercises';
import { formatDay } from '@/lib/date';

type Props = {
  /** The session assigned to this weekday, or null if the plan isn't set up. */
  plan: PlanDay | null;
  sets: WorkoutSet[];
  /** Last session + standing records per exercise key; absent while loading. */
  context?: Record<string, ExerciseContext>;
  /** Which planned exercises are done, and what's missing. */
  progress?: PlanProgress | null;
  /** Exercises moved onto this day from one that was missed. */
  carried?: CarriedExercise[];
  /** The date this card is for — carry-forward needs it. */
  date?: string;
  onLogSet: (set: { exercise: string; reps: number; weightKg: number | null }) => void;
  /** Comma-separated muscle groups when today isn't following the plan. */
  focus?: string;
  onChangeFocus?: (value: string) => void;
  onRemoveSet: (id: string) => void;
  onCarried?: () => void;
  onDropCarried?: (id: string) => void;
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
  onDrop,
  carriedFrom,
  hint,
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
  /** Present only for carried-over rows, which can be dropped from the day. */
  onDrop?: () => void;
  carriedFrom?: string;
  /**
   * Replaces the "extra" label. Focus rows are the session, not something
   * logged outside it, so calling them "extra" is simply wrong — they show
   * their muscle group instead, which also tells the two apart when two
   * groups are mixed.
   */
  hint?: string;
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

  // Nothing ever logged for this lift. Worth saying explicitly rather than
  // showing an empty space, because "no record yet" is different from "I
  // haven't loaded your record".
  const firstTime = Boolean(context) && !context!.last && done.length === 0;

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
            {!target && done.length === 0 && (hint ?? 'extra')}
          </span>

          {firstTime && (
            <span className="mt-0.5 block text-xs text-muted">
              No record yet — whatever you log today becomes the one to beat.
            </span>
          )}

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

      {onDrop && (
        <div className="-mt-1 flex items-center gap-2 pb-2 pl-10">
          <span className="text-[11px] text-amber-700 dark:text-amber-400">
            carried from {carriedFrom}
          </span>
          <button
            type="button"
            onClick={onDrop}
            className="text-[11px] text-muted underline"
          >
            drop
          </button>
        </div>
      )}

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
export function WorkoutCard({
  plan,
  sets,
  context,
  progress = null,
  carried = [],
  date,
  onLogSet,
  onRemoveSet,
  onCarried,
  onDropCarried,
  focus = '',
  onChangeFocus,
}: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [reps, setReps] = useState('');
  const [weight, setWeight] = useState('');
  // Exercises named by hand that have no sets yet — without this they'd vanish
  // the instant you added them.
  const [adHoc, setAdHoc] = useState<string[]>([]);
  const [choosing, setChoosing] = useState(false);
  /** Exercises for the chosen groups, fetched when a focus is set. */
  const [focusExercises, setFocusExercises] = useState<
    { id: string; name: string; muscleGroup: string }[]
  >([]);

  const focusGroups = useMemo(
    () => focus.split(',').map((g) => g.trim()).filter(Boolean),
    [focus],
  );

  // Only fetched when a focus is actually set — following the plan costs
  // nothing extra.
  useEffect(() => {
    if (focusGroups.length === 0) {
      setFocusExercises([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/exercise-library?muscle=${encodeURIComponent(focusGroups.join(','))}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { exercises: { id: string; name: string; muscleGroup: string }[] }) => {
        if (!cancelled) setFocusExercises(d.exercises);
      })
      .catch(() => !cancelled && setFocusExercises([]));
    return () => {
      cancelled = true;
    };
  }, [focusGroups]);

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
    const accountedFor = new Set([
      ...(plan?.exercises ?? []).map((e) => keyOf(e.name)),
      ...carried.map((c) => keyOf(c.name)),
    ]);
    const seen = new Set([...byExercise.keys(), ...adHoc]);
    return [...seen].filter((name) => !accountedFor.has(keyOf(name)));
  }, [byExercise, plan, adHoc, carried]);

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
          {focusGroups.length > 0
            ? focusGroups.map(muscleGroupLabel).join(' + ')
            : isRest
              ? 'Rest day'
              : plan.name}
          <span className="ml-2 text-xs font-normal text-muted">
            {focusGroups.length > 0 ? "today's focus" : "today's plan"}
          </span>
        </h2>
        {sets.length > 0 && (
          <p className="shrink-0 text-sm tabular-nums text-muted">
            {sets.length} {sets.length === 1 ? 'set' : 'sets'} ·{' '}
            {totalVolume.toLocaleString()} kg
          </p>
        )}
      </div>

      {focusGroups.length === 0 && progress && progress.totalCount > 0 && (
        <div className="pb-1">
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span
              className={progress.complete ? 'font-medium text-accent' : 'text-muted'}
            >
              {progress.complete
                ? '✓ Plan complete'
                : `${progress.doneCount} of ${progress.totalCount} done`}
            </span>
            {!progress.complete && progress.missed.length > 0 && (
              <span className="text-muted">
                {progress.missed.length} to go
              </span>
            )}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${(progress.doneCount / progress.totalCount) * 100}%` }}
            />
          </div>
        </div>
      )}

      {isRest && sets.length === 0 && focusGroups.length === 0 && (
        <p className="py-2 text-sm text-muted">
          Nothing scheduled today. Set your split on the Plan tab — or log something
          anyway below.
        </p>
      )}

      {/* Swapping the day's muscle group is a per-day decision, not an edit to
          the weekly split — see DailyEntry.workoutFocus. */}
      {onChangeFocus && (choosing ? (
        <FocusChooser
          initial={focusGroups}
          onCancel={() => setChoosing(false)}
          onSave={(groups) => {
            onChangeFocus(groups.join(','));
            setChoosing(false);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setChoosing(true)}
          className="text-xs font-medium text-accent"
        >
          {focusGroups.length > 0
            ? 'Change focus'
            : isRest
              ? 'Training something today?'
              : `Not doing ${plan.name.toLowerCase()} today?`}
        </button>
      ))}

      {focusGroups.length > 0 && onChangeFocus && (
        <button
          type="button"
          onClick={() => onChangeFocus('')}
          className="ml-3 text-xs text-muted underline"
        >
          back to plan
        </button>
      )}

      <ul>
        {/* With a focus set, the plan's exercises are not what's happening —
            the chosen groups' exercises take their place. Logged sets still
            appear either way, via `extras`. */}
        {focusGroups.length > 0
          ? focusExercises
              .filter((e) => !byExercise.has(e.name))
              .map((e) => (
                <ExerciseRow
                  key={e.id}
                  {...rowProps(e.name)}
                  hint={muscleGroupLabel(e.muscleGroup)}
                />
              ))
          : (plan?.exercises ?? []).map((e) => (
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

      {carried.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-2.5">
          <p className="mb-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            ↪ Carried over
          </p>
          <ul>
            {carried.map((c) => (
              <ExerciseRow
                key={c.id}
                {...rowProps(c.name)}
                target={{ sets: c.sets, reps: c.reps }}
                carriedFrom={formatDay(c.fromDate)}
                onDrop={onDropCarried ? () => onDropCarried(c.id) : undefined}
              />
            ))}
          </ul>
        </div>
      )}

      {progress && date && onCarried && !progress.complete && (
        <CarryForward date={date} progress={progress} onCarried={onCarried} />
      )}

      <AddExtra
        onAdd={(name) => {
          setAdHoc((prev) => (prev.includes(name) ? prev : [...prev, name]));
          setOpen(name);
        }}
      />
    </section>
  );
}

/** Lets you log something the plan didn't ask for without editing the plan. */
function AddExtra({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn-quiet mt-2 w-full" onClick={() => setOpen(true)}>
        + Log another exercise
      </button>
    );
  }

  return (
    <ExercisePicker
      onCancel={() => setOpen(false)}
      onPick={(name) => {
        onAdd(name);
        setOpen(false);
      }}
    />
  );
}

/**
 * Multi-select of muscle groups for a day that isn't following the plan.
 *
 * Multi rather than single because the common real answer is two — "chest and
 * shoulders" — and forcing one at a time would mean doing this twice for the
 * most ordinary case.
 */
function FocusChooser({
  initial,
  onSave,
  onCancel,
}: {
  initial: string[];
  onSave: (groups: string[]) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<string[]>(initial);

  const toggle = (key: string) =>
    setPicked((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface p-3">
      <p className="text-sm font-medium">What are you training today?</p>

      <div className="grid grid-cols-4 gap-1.5">
        {MUSCLE_GROUPS.map((g) => {
          const on = picked.includes(g.key);
          return (
            <button
              key={g.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(g.key)}
              className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl border text-[0.65rem] font-medium transition active:scale-95 ${
                on ? 'border-accent bg-accent/10 text-ink' : 'border-line bg-card text-muted'
              }`}
            >
              <span aria-hidden className="text-sm">
                {g.icon}
              </span>
              {g.label}
            </button>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary flex-1"
          disabled={picked.length === 0}
          onClick={() => onSave(picked)}
        >
          Show these exercises
        </button>
        <button type="button" className="btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
