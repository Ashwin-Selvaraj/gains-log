'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HABITS } from '@/lib/goals';
import { mutate, OfflineQueuedError } from '@/lib/sync';
import type {
  Entry,
  ExerciseContext,
  Macros,
  Meal,
  Meeting,
  PlanDay,
  Photo,
  Preset,
  Settings,
  WorkoutSet,
} from '@/lib/types';
import { StampButton } from '@/components/StampButton';
import { PhotoEstimate } from '@/components/PhotoEstimate';
import { FoodPicker } from '@/components/FoodPicker';
import { TargetsBar } from '@/components/TargetsBar';
import { WorkoutCard } from '@/components/WorkoutCard';
import { SaveBar, type SaveState } from '@/components/SaveBar';
import { PhotoSection } from '@/components/PhotoSection';

type Props = {
  date: string;
  initialEntry: Entry;
  presets: Preset[];
  /** The weekly split's session for this day's weekday, if the plan is set up. */
  plan?: PlanDay | null;
  /** Last session + records per exercise key, for the in-gym context line. */
  workoutContext?: Record<string, ExerciseContext>;
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
  settings = null,
  showTargets = false,
  inlineSaveBar = false,
}: Props) {
  const [entry, setEntry] = useState<Entry>(initialEntry);
  const [error, setError] = useState<string | null>(null);

  const [saveState, setSaveState] = useState<SaveState>('clean');

  /**
   * Edits to the day's own fields accumulate here instead of firing a request
   * each time. Held in a ref rather than state so the flush triggers below can
   * read the latest value without re-subscribing on every keystroke.
   */
  const pending = useRef<Record<string, unknown>>({});

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

  /** Applies the change locally at once; the write waits for Save or a nav away. */
  const stage = useCallback((field: keyof Entry, value: unknown) => {
    setEntry((prev) => ({ ...prev, [field]: value }) as Entry);
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
    async (time: string, title: string) => {
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

  const addSet = useCallback(
    async (set: { exercise: string; reps: number; weightKg: number | null }) => {
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
    [date, report],
  );

  const removeSet = useCallback(
    async (id: string) => {
      setEntry((prev) => ({ ...prev, sets: prev.sets.filter((s) => s.id !== id) }));
      if (id.startsWith('tmp-')) return;
      await mutate(`/api/sets/${id}`, 'DELETE').catch(report);
    },
    [report],
  );

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

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      )}

      <section aria-label="Habits" className="grid grid-cols-2 gap-3">
        {HABITS.map(({ key, label, icon }) => (
          <StampButton
            key={key}
            label={label}
            icon={icon}
            checked={entry[key]}
            onToggle={() => stage(key, !entry[key])}
          />
        ))}
      </section>

      <WorkoutCard
        plan={plan}
        sets={entry.sets}
        context={workoutContext}
        onLogSet={addSet}
        onRemoveSet={removeSet}
      />

      {showTargets && settings && (
        <TargetsBar totals={totals} settings={settings} />
      )}

      <section className="card space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="Weight"
            unit="kg"
            value={entry.weightKg}
            step="0.1"
            onChange={(v) => stage('weightKg', v)}
          />
          <NumberField
            label="Sleep"
            unit="hrs"
            value={entry.sleepHours}
            step="0.5"
            onChange={(v) => stage('sleepHours', v)}
          />
          <NumberField
            label="Water"
            unit="L"
            value={entry.waterLitres}
            step="0.25"
            onChange={(v) => stage('waterLitres', v)}
          />
        </div>

        <div>
          <label className="label" htmlFor={`workout-${date}`}>
            What I trained
          </label>
          <input
            id={`workout-${date}`}
            className="field"
            value={entry.workoutNote}
            placeholder="Push day — bench, OHP, dips"
            onChange={(e) => stage('workoutNote', e.target.value)}
          />
        </div>

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
      </section>

      <MeetingsSection
        meetings={entry.meetings}
        onAdd={addMeeting}
        onRemove={removeMeeting}
      />

      <MealsSection
        meals={entry.meals}
        presets={presets}
        totals={totals}
        onAdd={addMeal}
        onRemove={removeMeal}
      />

      <PhotoSection
        date={date}
        photos={entry.photos}
        onChange={(photos: Photo[]) => setEntry((prev) => ({ ...prev, photos }))}
      />

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
  onChange: (value: string) => void;
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
          onChange(e.target.value);
        }}
      />
    </div>
  );
}

function MeetingsSection({
  meetings,
  onAdd,
  onRemove,
}: {
  meetings: Meeting[];
  onAdd: (time: string, title: string) => void;
  onRemove: (id: string) => void;
}) {
  const [time, setTime] = useState('');
  const [title, setTitle] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!time || !title.trim()) return;
    onAdd(time, title.trim());
    setTitle('');
  }

  return (
    <section className="card space-y-3">
      <h2 className="text-base font-semibold">Meetings</h2>

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

      <form onSubmit={submit} className="flex gap-2">
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
}: {
  meals: Meal[];
  presets: Preset[];
  totals: Macros;
  onAdd: (payload: Record<string, unknown>, optimistic: Omit<Meal, 'id'>) => void;
  onRemove: (id: string) => void;
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
    <section className="card space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Meals</h2>
        <p className="shrink-0 text-sm tabular-nums text-muted">
          {totals.kcal} kcal · {totals.protein}g protein
        </p>
      </div>

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
