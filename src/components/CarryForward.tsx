'use client';

import { useState } from 'react';
import { addDays, formatDay } from '@/lib/date';
import type { PlanProgress } from '@/lib/types';

type Props = {
  date: string;
  progress: PlanProgress;
  onCarried: () => void;
};

/**
 * Moves what you missed onto a later day, rather than letting it silently
 * vanish at midnight.
 *
 * Only the *incomplete* exercises are offered — carrying a session you three
 * quarters finished would overstate the debt and make the next day look
 * hopeless, which is exactly how a plan gets abandoned.
 */
export function CarryForward({ date, progress, onCarried }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(progress.missed.map((m) => m.exerciseKey)),
  );
  const [target, setTarget] = useState(() => addDays(date, 1));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (progress.missed.length === 0) return null;

  const choices = [
    { label: 'Tomorrow', value: addDays(date, 1) },
    { label: 'In 2 days', value: addDays(date, 2) },
    { label: 'Next week', value: addDays(date, 7) },
  ];

  async function carry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/carried', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromDate: date,
          toDate: target,
          exercises: progress.missed
            .filter((m) => selected.has(m.exerciseKey))
            .map((m) => ({ name: m.name, sets: m.sets, reps: m.reps })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not carry forward');
      setOpen(false);
      onCarried();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not carry forward');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn-quiet mt-2 w-full" onClick={() => setOpen(true)}>
        ↪ Carry {progress.missed.length} missed{' '}
        {progress.missed.length === 1 ? 'exercise' : 'exercises'} forward
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-3 rounded-2xl border border-line bg-surface p-3">
      <p className="text-sm font-medium">Carry forward</p>

      <ul className="space-y-1.5">
        {progress.missed.map((m) => {
          const on = selected.has(m.exerciseKey);
          return (
            <li key={m.exerciseKey}>
              <button
                type="button"
                onClick={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(m.exerciseKey)) next.delete(m.exerciseKey);
                    else next.add(m.exerciseKey);
                    return next;
                  })
                }
                aria-pressed={on}
                className={`flex min-h-[44px] w-full items-center gap-2.5 rounded-xl border px-3 text-left
                            ${on ? 'border-accent bg-accent/10' : 'border-line bg-card'}`}
              >
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold
                              ${on ? 'bg-accent text-white' : 'border border-line text-muted'}`}
                >
                  {on ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {m.sets}×{m.reps}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <div>
        <p className="label">Move to</p>
        <div className="flex flex-wrap gap-2">
          {choices.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setTarget(c.value)}
              aria-pressed={target === c.value}
              className={`min-h-[44px] rounded-xl border px-3 text-sm font-medium
                          ${target === c.value ? 'border-accent bg-accent/10' : 'border-line bg-card'}`}
            >
              {c.label}
              <span className="ml-1.5 text-xs font-normal text-muted">
                {formatDay(c.value, date)}
              </span>
            </button>
          ))}
        </div>
        <input
          type="date"
          className="field mt-2"
          value={target}
          min={addDays(date, 1)}
          onChange={(e) => setTarget(e.target.value)}
          aria-label="Carry forward to date"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="btn-primary flex-1"
          onClick={carry}
          disabled={busy || selected.size === 0}
        >
          {busy ? 'Moving…' : `Move ${selected.size}`}
        </button>
        <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}
