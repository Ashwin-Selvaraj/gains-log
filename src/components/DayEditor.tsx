'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MEASURES } from '@/lib/goals';
import { MeasureSlider } from '@/components/MeasureSlider';
import { Section } from '@/components/Section';
import { mutate, OfflineQueuedError } from '@/lib/sync';
import type {
  CarriedExercise,
  Entry,
  ExerciseContext,
  Macros,
  Meal,
  Meeting,
  PlanDay,
  PlanProgress,
  Photo,
  Preset,
  Settings,
  WorkoutSet,
} from '@/lib/types';
import { PhotoEstimate } from '@/components/PhotoEstimate';
import { FoodPicker } from '@/components/FoodPicker';
import { TargetsBar } from '@/components/TargetsBar';
import { WorkoutCard } from '@/components/WorkoutCard';
import { SaveBar, type SaveState } from '@/components/SaveBar';
import { PhotoSection } from '@/components/PhotoSection';
import { PRCelebration } from '@/components/PRCelebration';
import { detectPR, exerciseKey, type PRAchievement } from '@/lib/prs';
import { planProgress } from '@/lib/plan';

type Props = {
  date: string;
  initialEntry: Entry;
  presets: Preset[];
  /** The weekly split's session for this day's weekday, if the plan is set up. */
  plan?: PlanDay | null;
  /** Last session + records per exercise key, for the in-gym context line. */
  workoutContext?: Record<string, ExerciseContext>;
  /** Exercises carried onto this day from one that was missed. */
  carried?: CarriedExercise[];
  /** Called after carrying forward or dropping, so the parent can refetch. */
  onWorkoutChanged?: () => void;
  settings?: Settings | null;
  /** Today shows the calorie/protein target bar; past days don't need nagging. */
  showTargets?: boolean;
  /**
   * History expands a day inside a card, where a fixed footer bar would float
   * over the wrong content — it gets an inline save bar instead.
   */
  inlineSaveBar?: boolean;
};

export function DayEditor({
  date,
  initialEntry,
  presets,
  plan = null,
  workoutContext,
  carried = [],
  onWorkoutChanged,
  settings = null,
  showTargets = false,
  inlineSaveBar = false,
}: Props) {
  const [entry, setEntry] = useState<Entry>(initialEntry);
  const [error, setError] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [achievement, setAchievement] = useState<PRAchievement | null>(null);

  /**
   * Edits to the day's own fields accumulate here instead of firing a request
   * each time. Held in a ref rather than state so the flush triggers below can
   * read the latest value without re-subscribing on every keystroke.
   */
  /** Fields edited since the last write. Typed as a partial Entry so what goes
   *  into it is the same shape as what comes out of the API. */
  const pending = useRef<Partial<Entry>>({});

  const report = useCallback((err: unknown) => {
    // A queued write is a success from the user's point of view.
    if (err instanceof OfflineQueuedError) return;
    setError(err instanceof Error ? err.message : 'Could not save');
    setTimeout(() => setError(null), 4000);
  }, []);

  /**
   * Sends every staged field in one request. `keepalive` is used when the page
   * is going away, where an ordinary fetch would be cancelled mid-flight.
   */
  const flush = useCallback(
    async (keepalive = false) => {
      const body = pending.current;
      if (Object.keys(body).length === 0) return;

      // Cleared up front so edits made during the request aren't swallowed by
      // the success path below.
      pending.current = {};
      // A background flush still clears the indicator: the request has left and
      // the outbox catches it if the network drops. Leaving the bar reading
      // "Unsaved changes" over data that did save is the worse lie.
      setSaveState(keepalive ? 'clean' : 'saving');

      try {
        await mutate(`/api/entries/${date}`, 'PATCH', body, keepalive);
        if (!keepalive) {
          setSaveState((s) => (s === 'saving' ? 'saved' : s));
          setTimeout(() => setSaveState((s) => (s === 'saved' ? 'clean' : s)), 1800);
        }
      } catch (err) {
        // Put the fields back so the change isn't silently dropped; the offline
        // outbox has already queued it if this was a network failure.
        pending.current = { ...body, ...pending.current };
        if (err instanceof OfflineQueuedError) {
          pending.current = {};
          setSaveState('clean');
          return;
        }
        setSaveState('dirty');
        report(err);
      }
    },
    [date, report],
  );

  // Always call the newest flush from the listeners below without re-binding
  // them on every render.
  const flushRef = useRef(flush);
  flushRef.current = flush;

  /**
   * Applies the change locally at once; the write waits for Save or a nav away.
   *
   * Generic over the field, so `value` must be that field's actual type. It
   * used to take `unknown` and cast the result `as Entry`, which let a numeric
   * field be staged as a string: the value went into `entry` as "2.5", and any
   * component reading it back and calling a number method on it crashed the
   * page. The cast was the reason TypeScript never noticed.
   */
  const stage = useCallback(<K extends keyof Entry>(field: K, value: Entry[K]) => {
    setEntry((prev) => ({ ...prev, [field]: value }));
    pending.current[field] = value;
    setSaveState('dirty');
  }, []);

  // Leaving the screen counts as "done editing": navigating to another tab
  // unmounts this, and backgrounding the app fires pagehide/visibilitychange.
  // Between them, staged edits can't be lost by walking away.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushRef.current(true);
    };
    const onPageHide = () => void flushRef.current(true);

    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      void flushRef.current(true);
    };
  }, []);

  /**
   * Accepts any of the three logging shapes — { foodId, grams }, { presetId },
   * or typed macros. The server computes and snapshots the macros in every
   * case; `optimistic` is only what we draw until it answers.
   */
  const addMeal = useCallback(
    async (payload: Record<string, unknown>, optimisticMeal: Omit<Meal, 'id'>) => {
      const optimistic: Meal = { ...optimisticMeal, id: `tmp-${crypto.randomUUID()}` };
      setEntry((prev) => ({ ...prev, meals: [...prev.meals, optimistic] }));
      try {
        const saved = await mutate<Meal>(`/api/entries/${date}/meals`, 'POST', payload);
        setEntry((prev) => ({
          ...prev,
          meals: prev.meals.map((m) => (m.id === optimistic.id ? saved : m)),
        }));
      } catch (err) {
        report(err);
      }
    },
    [date, report],
  );

  const removeMeal = useCallback(
    async (id: string) => {
      setEntry((prev) => ({ ...prev, meals: prev.meals.filter((m) => m.id !== id) }));
      if (id.startsWith('tmp-')) return; // never reached the server
      await mutate(`/api/meals/${id}`, 'DELETE').catch(report);
    },
    [report],
  );

  const addMeeting = useCallback(
    async (time: string, title: string, addToCalendar: boolean) => {
      const optimistic: Meeting = { id: `tmp-${crypto.randomUUID()}`, time, title };
      setEntry((prev) => ({
        ...prev,
        meetings: [...prev.meetings, optimistic].sort((a, b) =>
          a.time.localeCompare(b.time),
        ),
      }));
      try {
        const saved = await mutate<Meeting>(`/api/entries/${date}/meetings`, 'POST', {
          time,
          title,
          addToCalendar,
        });
        setEntry((prev) => ({
          ...prev,
          meetings: prev.meetings.map((m) => (m.id === optimistic.id ? saved : m)),
        }));
      } catch (err) {
        report(err);
      }
    },
    [date, report],
  );

  const removeMeeting = useCallback(
    async (id: string) => {
      setEntry((prev) => ({
        ...prev,
        meetings: prev.meetings.filter((m) => m.id !== id),
      }));
      if (id.startsWith('tmp-')) return;
      await mutate(`/api/meetings/${id}`, 'DELETE').catch(report);
    },
    [report],
  );

  /** Flip one meeting's calendar sync. The server does the Google side. */
  const toggleMeetingCalendar = useCallback(
    async (id: string, addToCalendar: boolean) => {
      if (id.startsWith('tmp-')) return;
      try {
        const saved = await mutate<Meeting>(`/api/meetings/${id}`, 'PATCH', {
          addToCalendar,
        });
        setEntry((prev) => ({
          ...prev,
          meetings: prev.meetings.map((m) => (m.id === id ? saved : m)),
        }));
      } catch (err) {
        report(err);
      }
    },
    [report],
  );

  const addSet = useCallback(
    async (set: { exercise: string; reps: number; weightKg: number | null }) => {
      // Checked before the set is added to state, so "what did I beat?" compares
      // against the standing record plus everything logged earlier today —
      // not against the set being logged right now.
      const key = exerciseKey(set.exercise);
      const ctx = workoutContext?.[key];
      const todaySets = entry.sets.filter((s) => exerciseKey(s.exercise) === key);

      const pr = detectPR({
        exercise: set.exercise,
        bodyweight: ctx?.bodyweight ?? set.weightKg === null,
        priorHeaviestKg: ctx?.heaviestKg ?? null,
        priorBestReps: ctx?.bestReps ?? null,
        priorBest1RM: ctx?.best1RM ?? null,
        todaySets,
        newSet: { reps: set.reps, weightKg: set.weightKg },
        neverLogged: !ctx?.last,
      });
      if (pr) setAchievement(pr);

      const optimistic: WorkoutSet = { ...set, id: `tmp-${crypto.randomUUID()}` };
      // Logging a set implies the workout happened; the server agrees.
      setEntry((prev) => ({
        ...prev,
        sets: [...prev.sets, optimistic],
        workoutDone: true,
      }));
      try {
        const saved = await mutate<WorkoutSet>(`/api/entries/${date}/sets`, 'POST', set);
        setEntry((prev) => ({
          ...prev,
          sets: prev.sets.map((s) => (s.id === optimistic.id ? saved : s)),
        }));
      } catch (err) {
        report(err);
      }
    },
    [date, report, workoutContext, entry.sets],
  );

  const removeSet = useCallback(
    async (id: string) => {
      setEntry((prev) => ({ ...prev, sets: prev.sets.filter((s) => s.id !== id) }));
      if (id.startsWith('tmp-')) return;
      await mutate(`/api/sets/${id}`, 'DELETE').catch(report);
    },
    [report],
  );

  /**
   * Computed here rather than taken from the server so the bar moves the
   * instant a set is logged. Carried work counts toward the day's completion —
   * it is part of today's session now, whatever day it was promised on.
   */
  const progress: PlanProgress | null = useMemo(() => {
    const planned = [
      ...(plan?.exercises ?? []).map((e) => ({
        name: e.name,
        exerciseKey: exerciseKey(e.name),
        sets: e.sets,
        reps: e.reps,
      })),
      ...carried.map((c) => ({
        name: c.name,
        exerciseKey: c.key,
        sets: c.sets,
        reps: c.reps,
      })),
    ];
    if (planned.length === 0) return null;
    return planProgress(plan?.name ?? null, planned, entry.sets);
  }, [plan, carried, entry.sets]);

  const totals = useMemo(
    () =>
      entry.meals.reduce(
        (acc, m) => ({
          kcal: acc.kcal + (m.calories ?? 0),
          protein: Math.round((acc.protein + (m.protein ?? 0)) * 10) / 10,
          carbs: Math.round((acc.carbs + (m.carbs ?? 0)) * 10) / 10,
          fat: Math.round((acc.fat + (m.fat ?? 0)) * 10) / 10,
          fiber: Math.round((acc.fiber + (m.fiber ?? 0)) * 10) / 10,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      ),
    [entry.meals],
  );

  const meetingCount = entry.meetings.length;
  const photoCount = entry.photos.length;

  return (
    <div className="space-y-3">
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}

      {/* ── Training ───────────────────────────────────────────────────────
          The Workout tick now sits in this section's header rather than in a
          separate grid three cards above the sets it refers to. */}
      <Section
        title="Training"
        icon="🏋️"
        done={entry.workoutDone}
        onToggleDone={() => stage('workoutDone', !entry.workoutDone)}
        doneLabel="Mark today's workout done"
        summary={
          progress
            ? `${progress.doneCount}/${progress.totalCount}`
            : (plan?.name ?? undefined)
        }
      >
        <WorkoutCard
          plan={plan}
          sets={entry.sets}
          context={workoutContext}
          progress={progress}
          carried={carried}
          date={date}
          onCarried={() => onWorkoutChanged?.()}
          onDropCarried={async (id) => {
            await fetch(`/api/carried/${id}`, { method: 'DELETE' }).catch(() => {});
            onWorkoutChanged?.();
          }}
          onLogSet={addSet}
          onRemoveSet={removeSet}
        />

        <div>
          <label className="label" htmlFor={`workout-${date}`}>
            Session note
          </label>
          <input
            id={`workout-${date}`}
            className="field"
            value={entry.workoutNote}
            placeholder="Felt strong — bench moved well"
            onChange={(e) => stage('workoutNote', e.target.value)}
          />
        </div>
      </Section>

      {/* ── Fuel ───────────────────────────────────────────────────────────
          Targets and the meals that move them, in one place. They were two
          separate cards, so the numbers and the thing that changes them were
          never on screen together. */}
      <Section
        title="Fuel"
        icon="🍽️"
        summary={
          <span className="tabular-nums">
            {Math.round(totals.kcal)} kcal · {totals.protein}g P
          </span>
        }
      >
        {showTargets && settings && <TargetsBar totals={totals} settings={settings} />}

        <MealsSection
          meals={entry.meals}
          presets={presets}
          totals={totals}
          onAdd={addMeal}
          onRemove={removeMeal}
          bare
        />
      </Section>

      {/* ── Body ───────────────────────────────────────────────────────────
          Weight, water and sleep: the three numbers you measure rather than
          tick. Weight used to share a card with two unrelated text notes. */}
      <Section
        title="Body"
        icon="📊"
        summary={
          <span className="tabular-nums">
            {entry.weightKg ? `${entry.weightKg} kg` : 'no weigh-in'}
          </span>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Weight"
            unit="kg"
            value={entry.weightKg}
            step="0.1"
            onChange={(v) => stage('weightKg', v)}
          />
        </div>

        <div className="border-t border-line pt-4">
          <MeasureSlider
            {...MEASURES.water}
            value={entry.waterLitres}
            onChange={(litres) => {
              stage('waterLitres', litres);
              // The tick is derived, not separately toggled. Keeping a manual
              // Water stamp alongside a litres figure let the two disagree —
              // ticked but zero litres, or two litres and no tick — and the
              // report counts the tick.
              stage('waterDone', (litres ?? 0) > 0);
            }}
          />
        </div>

        <div className="border-t border-line pt-4">
          <MeasureSlider
            {...MEASURES.sleep}
            value={entry.sleepHours}
            onChange={(hours) => stage('sleepHours', hours)}
          />

          {/* Hours and quality are different facts: eight restless hours is not
              a good night, and six good ones can be. */}
          <button
            type="button"
            aria-pressed={entry.sleptWell}
            onClick={() => stage('sleptWell', !entry.sleptWell)}
            className={`mt-2 inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-3.5 text-sm transition active:scale-[0.98] ${
              entry.sleptWell
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-line bg-surface text-muted'
            }`}
          >
            <span aria-hidden>{entry.sleptWell ? '✓' : '○'}</span>
            Slept well
          </button>
        </div>
      </Section>

      {/* ── Learning ───────────────────────────────────────────────────────
          Its tick and its note were in different cards. */}
      <Section
        title="Learning"
        icon="📘"
        done={entry.learningDone}
        onToggleDone={() => stage('learningDone', !entry.learningDone)}
        doneLabel="Mark today's learning done"
      >
        <div>
          <label className="label" htmlFor={`learning-${date}`}>
            What I learned
          </label>
          <input
            id={`learning-${date}`}
            className="field"
            value={entry.learningNote}
            placeholder="Postgres index types"
            onChange={(e) => stage('learningNote', e.target.value)}
          />
        </div>
      </Section>

      {/* ── Occasional ─────────────────────────────────────────────────────
          Meetings and photos are not part of most days, so they start folded
          with a count in the header — present when wanted, silent otherwise. */}
      <Section
        title="Meetings"
        icon="🗓️"
        collapsible
        defaultOpen={meetingCount > 0}
        summary={meetingCount > 0 ? `${meetingCount}` : 'none'}
      >
        <MeetingsSection
          meetings={entry.meetings}
          onAdd={addMeeting}
          onRemove={removeMeeting}
          onToggleCalendar={toggleMeetingCalendar}
          calendarConnected={Boolean(settings?.calendarConnected)}
          bare
        />
      </Section>

      <Section
        title="Photos"
        icon="📸"
        collapsible
        defaultOpen={photoCount > 0}
        summary={photoCount > 0 ? `${photoCount}` : 'none'}
      >
        <PhotoSection
          date={date}
          photos={entry.photos}
          onChange={(photos: Photo[]) => setEntry((prev) => ({ ...prev, photos }))}
          bare
        />
      </Section>

      <PRCelebration achievement={achievement} onDismiss={() => setAchievement(null)} />

      <SaveBar state={saveState} onSave={() => void flush()} inline={inlineSaveBar} />
    </div>
  );
}

function NumberField({
  label,
  unit,
  value,
  step,
  onChange,
}: {
  label: string;
  unit: string;
  value: number | null;
  step: string;
  onChange: (value: number | null) => void;
}) {
  // Kept as a string so a half-typed "7." doesn't get normalised away mid-entry.
  const [text, setText] = useState(value === null ? '' : String(value));

  return (
    <div>
      <label className="label">
        {label} <span className="font-normal">({unit})</span>
      </label>
      <input
        className="field text-center"
        type="number"
        inputMode="decimal"
        step={step}
        min="0"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          // The text stays local so a half-typed "7." survives; only a usable
          // number (or a cleared field) is handed upwards.
          const raw = e.target.value.trim();
          const n = Number(raw);
          onChange(raw === '' || !Number.isFinite(n) ? null : n);
        }}
      />
    </div>
  );
}

function MeetingsSection({
  meetings,
  onAdd,
  onRemove,
  onToggleCalendar,
  calendarConnected,
  bare = false,
}: {
  meetings: Meeting[];
  onAdd: (time: string, title: string, addToCalendar: boolean) => void;
  onRemove: (id: string) => void;
  onToggleCalendar: (id: string, addToCalendar: boolean) => void;
  calendarConnected: boolean;
  /** Nested inside a <Section>, which already draws the card and the heading. */
  bare?: boolean;
}) {
  const [time, setTime] = useState('');
  const [title, setTitle] = useState('');
  // Off by default and reset after each add: a meeting typed here is often a
  // note to self, and quietly putting every one of them on a real calendar
  // other people can see is not a default anyone asked for.
  const [toCalendar, setToCalendar] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!time || !title.trim()) return;
    onAdd(time, title.trim(), toCalendar && calendarConnected);
    setTitle('');
    setToCalendar(false);
  }

  return (
    <section className={bare ? 'space-y-3' : 'card space-y-3'}>
      {!bare && <h2 className="text-base font-semibold">Meetings</h2>}

      {meetings.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {meetings.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-2 rounded-full border border-line bg-surface
                         py-1.5 pl-3 pr-1.5 text-sm"
            >
              <span className="font-medium tabular-nums">{m.time}</span>
              <span className="text-muted">{m.title}</span>

              {calendarConnected && !m.id.startsWith('tmp-') && (
                <button
                  type="button"
                  onClick={() => onToggleCalendar(m.id, !m.calendarEventId)}
                  aria-pressed={Boolean(m.calendarEventId)}
                  title={
                    m.calendarError
                      ? m.calendarError
                      : m.calendarEventId
                        ? 'On your Google Calendar — tap to remove it'
                        : 'Add to Google Calendar'
                  }
                  className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                    m.calendarError
                      ? 'text-amber-600 dark:text-amber-400'
                      : m.calendarEventId
                        ? 'text-accent'
                        : 'text-muted hover:bg-line'
                  }`}
                >
                  <span aria-hidden>{m.calendarError ? '!' : '📅'}</span>
                  <span className="sr-only">
                    {m.calendarEventId ? 'Remove from' : 'Add to'} Google Calendar
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={() => onRemove(m.id)}
                aria-label={`Remove ${m.title}`}
                className="flex h-7 w-7 items-center justify-center rounded-full text-muted
                           hover:bg-line"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="space-y-2">
        <div className="flex gap-2">
          <input
            type="time"
            className="field w-32 shrink-0"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            aria-label="Meeting time"
          />
          <input
            className="field"
            placeholder="Standup"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Meeting title"
          />
          <button type="submit" className="btn-quiet shrink-0 px-4" disabled={!time || !title.trim()}>
            Add
          </button>
        </div>

        {calendarConnected ? (
          <label className="flex items-center gap-2.5 px-1 text-sm text-muted">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--accent))]"
              checked={toCalendar}
              onChange={(e) => setToCalendar(e.target.checked)}
            />
            Also add to Google Calendar
          </label>
        ) : (
          <p className="px-1 text-xs text-muted">
            <Link href="/profile" className="underline underline-offset-2">
              Connect Google Calendar
            </Link>{' '}
            to push meetings to it.
          </p>
        )}
      </form>
    </section>
  );
}

function MealsSection({
  meals,
  presets,
  totals,
  onAdd,
  onRemove,
  bare = false,
}: {
  meals: Meal[];
  presets: Preset[];
  totals: Macros;
  onAdd: (payload: Record<string, unknown>, optimistic: Omit<Meal, 'id'>) => void;
  onRemove: (id: string) => void;
  /** Nested inside a <Section>, which already draws the card and the heading. */
  bare?: boolean;
}) {
  const [mode, setMode] = useState<'none' | 'search' | 'manual'>('none');
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      calories: calories === '' ? null : Number(calories),
      protein: protein === '' ? null : Number(protein),
      source: 'manual',
    };
    onAdd(payload, {
      name: payload.name,
      calories: payload.calories,
      protein: payload.protein,
      source: 'manual',
      photoUrl: null,
    });
    setName('');
    setCalories('');
    setProtein('');
    setMode('none');
  }

  return (
    <section className={bare ? 'space-y-3' : 'card space-y-3'}>
      {!bare && (
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Meals</h2>
          <p className="shrink-0 text-sm tabular-nums text-muted">
            {totals.kcal} kcal · {totals.protein}g protein
          </p>
        </div>
      )}

      {meals.length > 0 && (
        <>
          <ul className="divide-y divide-line">
            {meals.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                {m.photoUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={m.photoUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <span aria-hidden className="w-10 shrink-0 text-center text-lg">
                    {m.source === 'preset' ? '⭐' : m.source === 'food' ? '🥘' : '🍽️'}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="text-xs tabular-nums text-muted">
                    {m.calories ?? '—'} kcal · P {m.protein ?? '—'}
                    {m.carbs != null && ` · C ${m.carbs}`}
                    {m.fat != null && ` · F ${m.fat}`}
                    {m.fiber != null && m.fiber > 0 && ` · Fib ${m.fiber}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(m.id)}
                  aria-label={`Remove ${m.name}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full
                             text-muted hover:bg-line"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          {/* The full macro split, once there is anything to split. */}
          <p className="text-xs tabular-nums text-muted">
            Carbs {totals.carbs} g · Fat {totals.fat} g · Fibre {totals.fiber} g
          </p>
        </>
      )}

      {presets.length > 0 && (
        <div>
          <p className="label">One tap</p>
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  onAdd(
                    { presetId: p.id },
                    {
                      name: p.name,
                      calories: p.macros.kcal,
                      protein: p.macros.protein,
                      carbs: p.macros.carbs,
                      fat: p.macros.fat,
                      fiber: p.macros.fiber,
                      source: 'preset',
                      photoUrl: null,
                    },
                  )
                }
                className="min-h-[44px] rounded-xl border border-line bg-surface px-3 text-sm
                           font-medium active:scale-[0.97]"
              >
                {p.name}
                <span className="ml-1.5 text-xs font-normal text-muted">
                  {p.macros.protein}g
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'search' ? (
        <FoodPicker
          onCancel={() => setMode('none')}
          onPick={({ foodId, grams, name: foodName, macros }) =>
            onAdd(
              { foodId, grams },
              {
                name: foodName,
                calories: macros.kcal,
                protein: macros.protein,
                carbs: macros.carbs,
                fat: macros.fat,
                fiber: macros.fiber,
                grams,
                foodId,
                source: 'food',
                photoUrl: null,
              },
            )
          }
        />
      ) : (
        <button type="button" className="btn-primary w-full" onClick={() => setMode('search')}>
          🔍 Search food
        </button>
      )}

      <PhotoEstimate
        onConfirm={({ name: mealName, macros, photoUrl }) =>
          onAdd(
            {
              name: mealName,
              calories: macros.kcal,
              protein: macros.protein,
              carbs: macros.carbs,
              fat: macros.fat,
              fiber: macros.fiber,
              photoUrl,
              source: 'photo-estimate',
            },
            {
              name: mealName,
              calories: macros.kcal,
              protein: macros.protein,
              carbs: macros.carbs,
              fat: macros.fat,
              fiber: macros.fiber,
              source: 'photo-estimate',
              photoUrl,
            },
          )
        }
      />

      {mode === 'manual' ? (
        <form onSubmit={submitManual} className="space-y-2">
          <input
            className="field"
            placeholder="Meal name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Meal name"
            autoFocus
          />
          <div className="flex gap-2">
            <input
              className="field"
              inputMode="numeric"
              placeholder="kcal"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              aria-label="Calories"
            />
            <input
              className="field"
              inputMode="numeric"
              placeholder="protein g"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              aria-label="Protein in grams"
            />
            <button type="submit" className="btn-primary shrink-0" disabled={!name.trim()}>
              Add
            </button>
          </div>
        </form>
      ) : (
        mode === 'none' && (
          <button
            type="button"
            className="btn-quiet w-full"
            onClick={() => setMode('manual')}
          >
            ✏️ Type it manually
          </button>
        )
      )}
    </section>
  );
}
