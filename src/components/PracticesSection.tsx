'use client';

import { useEffect, useState } from 'react';
import { Section } from '@/components/Section';
import { todayKey } from '@/lib/date';

type Stats = {
  current: number;
  longest: number;
  atRisk: boolean;
  daysTracked: number;
  totalTicks: number;
};

type Practice = {
  id: string;
  name: string;
  icon: string;
  todayDone: boolean;
  stats: Stats;
};

/**
 * Open-ended daily checklist — "Post on Twitter", "Talk to someone", anything
 * that isn't one of the four built-in habits. Those live as fixed columns on
 * DailyEntry because the targets and report are built around exactly them;
 * this is the list for whatever else someone wants a streak on.
 *
 * Self-contained and independently fetched, like ReminderToggle — nothing
 * here depends on the day's entry or its staged-edit/save flow, so it has no
 * reason to route through DayEditor's state.
 */
export function PracticesSection() {
  const [practices, setPractices] = useState<Practice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');

  useEffect(() => {
    fetch(`/api/practices?today=${todayKey()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((p: Practice[]) => setPractices(p))
      .catch(() => setError('Could not load your practices.'));
  }, []);

  async function toggle(id: string) {
    // Applied locally first — the streak recalculating a moment later
    // shouldn't make the tap itself feel slow.
    setPractices(
      (prev) =>
        prev?.map((p) => (p.id === id ? { ...p, todayDone: !p.todayDone } : p)) ?? prev,
    );
    try {
      const res = await fetch(`/api/practices/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: todayKey() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setPractices(
        (prev) =>
          prev?.map((p) =>
            p.id === id ? { ...p, todayDone: json.done, stats: json.stats } : p,
          ) ?? prev,
      );
    } catch {
      // Roll back — the server is the source of truth for whether it's ticked.
      setPractices(
        (prev) =>
          prev?.map((p) => (p.id === id ? { ...p, todayDone: !p.todayDone } : p)) ?? prev,
      );
      setError('Could not save that — try again.');
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/practices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          icon: icon.trim() || undefined,
          today: todayKey(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not add that.');
      setPractices((prev) => [...(prev ?? []), json as Practice]);
      setName('');
      setIcon('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that.');
    } finally {
      setAdding(false);
    }
  }

  async function remove(p: Practice) {
    if (
      !confirm(
        `Remove "${p.name}"?\n\nThis deletes its whole history — the ${p.stats.longest}-day best streak included.`,
      )
    ) {
      return;
    }
    setPractices((prev) => prev?.filter((x) => x.id !== p.id) ?? prev);
    await fetch(`/api/practices/${p.id}`, { method: 'DELETE' }).catch(() => {});
  }

  const doneCount = practices?.filter((p) => p.todayDone).length ?? 0;

  return (
    <Section
      title="Practices"
      icon="🔥"
      summary={
        practices && practices.length > 0 ? `${doneCount}/${practices.length}` : undefined
      }
    >
      {error && (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {practices === null && !error && (
        <p className="text-sm text-muted">Loading…</p>
      )}

      {practices?.length === 0 && (
        <p className="text-sm text-muted">
          Anything you want a daily streak on — a post, a habit, a call. Add the first one
          below.
        </p>
      )}

      {practices && practices.length > 0 && (
        <ul className="divide-y divide-line">
          {practices.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <button
                type="button"
                aria-pressed={p.todayDone}
                aria-label={`Mark ${p.name} done today`}
                onClick={() => void toggle(p.id)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-base transition active:scale-95 ${
                  p.todayDone
                    ? 'border-accent bg-accent text-white'
                    : 'border-line bg-surface'
                }`}
              >
                <span aria-hidden>{p.todayDone ? '✓' : p.icon}</span>
              </button>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="text-xs tabular-nums text-muted">
                  {p.stats.current > 0 ? (
                    <>
                      🔥 {p.stats.current} day{p.stats.current === 1 ? '' : 's'}
                      {p.stats.atRisk && <span className="text-amber-600 dark:text-amber-400"> · today not logged</span>}
                    </>
                  ) : (
                    <>No streak yet</>
                  )}
                  {' · best '}
                  {p.stats.longest}
                </p>
              </div>

              <button
                type="button"
                onClick={() => void remove(p)}
                aria-label={`Remove ${p.name}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted hover:bg-line"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex gap-2">
        <input
          className="field w-14 shrink-0 px-2 text-center"
          placeholder="🔥"
          value={icon}
          maxLength={8}
          aria-label="Icon"
          onChange={(e) => setIcon(e.target.value)}
        />
        <input
          className="field"
          placeholder="Post on Twitter"
          value={name}
          aria-label="New practice name"
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          className="btn-quiet shrink-0 px-4"
          disabled={adding || !name.trim()}
        >
          {adding ? '…' : 'Add'}
        </button>
      </form>
    </Section>
  );
}
