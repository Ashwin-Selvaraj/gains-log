'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HABITS } from '@/lib/goals';
import { mutate, OfflineQueuedError } from '@/lib/sync';
import type { Entry, Meal, Meeting, PlanDay, Preset, Settings, WorkoutSet } from '@/lib/types';
import { StampButton } from '@/components/StampButton';
import { PhotoEstimate } from '@/components/PhotoEstimate';
import { TargetsBar } from '@/components/TargetsBar';
import { WorkoutCard } from '@/components/WorkoutCard';

type Props = {
  date: string;
  initialEntry: Entry;
  presets: Preset[];
  /** The weekly split's session for this day's weekday, if the plan is set up. */
  plan?: PlanDay | null;
  settings?: Settings | null;
  /** Today shows the calorie/protein target bar; past days don't need nagging. */
  showTargets?: boolean;
};

const DEBOUNCE_MS = 600;

export function DayEditor({
  date,
  initialEntry,
  presets,
  plan = null,
  settings = null,
  showTargets = false,
}: Props) {
  const [entry, setEntry] = useState<Entry>(initialEntry);
  const [error, setError] = useState<string | null>(null);

  // One timer per field: typing in the weight box shouldn't cancel a pending
  // save of the learning note.
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach(clearTimeout);
  }, []);

  const report = useCallback((err: unknown) => {
    // A queued write is a success from the user's point of view.
    if (err instanceof OfflineQueuedError) return;
    setError(err instanceof Error ? err.message : 'Could not save');
    setTimeout(() => setError(null), 4000);
  }, []);

  /** Applies the change locally at once, then persists it after the debounce. */
  const patch = useCallback(
    (field: keyof Entry, value: unknown, immediate = false) => {
      setEntry((prev) => ({ ...prev, [field]: value }) as Entry);

      clearTimeout(timers.current[field]);
      const send = () =>
        mutate(`/api/entries/${date}`, 'PATCH', { [field]: value }).catch(report);

      if (immediate) void send();
      else timers.current[field] = setTimeout(() => void send(), DEBOUNCE_MS);
    },
    [date, report],
  );

  const addMeal = useCallback(
    async (meal: Omit<Meal, 'id'>) => {
      const optimistic: Meal = { ...meal, id: `tmp-${crypto.randomUUID()}` };
      setEntry((prev) => ({ ...prev, meals: [...prev.meals, optimistic] }));
      try {
        const saved = await mutate<Meal>(`/api/entries/${date}/meals`, 'POST', meal);
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
    () => ({
      calories: entry.meals.reduce((s, m) => s + (m.calories ?? 0), 0),
      protein: entry.meals.reduce((s, m) => s + (m.protein ?? 0), 0),
    }),
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
            onToggle={() => patch(key, !entry[key], true)}
          />
        ))}
      </section>

      <WorkoutCard
        plan={plan}
        sets={entry.sets}
        onLogSet={addSet}
        onRemoveSet={removeSet}
      />

      {showTargets && settings && (
        <TargetsBar
          calories={totals.calories}
          protein={totals.protein}
          settings={settings}
        />
      )}

      <section className="card space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="Weight"
            unit="kg"
            value={entry.weightKg}
            step="0.1"
            onChange={(v) => patch('weightKg', v)}
          />
          <NumberField
            label="Sleep"
            unit="hrs"
            value={entry.sleepHours}
            step="0.5"
            onChange={(v) => patch('sleepHours', v)}
          />
          <NumberField
            label="Walk"
            unit="min"
            value={entry.walkMinutes}
            step="5"
            onChange={(v) => patch('walkMinutes', v)}
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
            onChange={(e) => patch('workoutNote', e.target.value)}
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
            onChange={(e) => patch('learningNote', e.target.value)}
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
  totals: { calories: number; protein: number };
  onAdd: (meal: Omit<Meal, 'id'>) => void;
  onRemove: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [manualOpen, setManualOpen] = useState(false);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      calories: calories === '' ? null : Number(calories),
      protein: protein === '' ? null : Number(protein),
      source: 'manual',
      photoUrl: null,
    });
    setName('');
    setCalories('');
    setProtein('');
  }

  return (
    <section className="card space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">Meals</h2>
        <p className="text-sm tabular-nums text-muted">
          {totals.calories} kcal · {totals.protein}g protein
        </p>
      </div>

      {meals.length > 0 && (
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
                  {m.source === 'preset' ? '⭐' : '🍽️'}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.name}</p>
                <p className="text-xs tabular-nums text-muted">
                  {m.calories ?? '—'} kcal · {m.protein ?? '—'}g protein
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
                  onAdd({
                    name: p.name,
                    calories: p.calories,
                    protein: p.protein,
                    source: 'preset',
                    photoUrl: null,
                  })
                }
                className="min-h-[44px] rounded-xl border border-line bg-surface px-3 text-sm
                           font-medium active:scale-[0.97]"
              >
                {p.name}
                <span className="ml-1.5 text-xs font-normal text-muted">
                  {p.protein ?? '—'}g
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <PhotoEstimate
        onConfirm={(meal) => onAdd({ ...meal, source: 'photo-estimate' })}
      />

      {manualOpen ? (
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
        <button
          type="button"
          className="btn-quiet w-full"
          onClick={() => setManualOpen(true)}
        >
          ✏️ Type a meal
        </button>
      )}
    </section>
  );
}
