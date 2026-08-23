'use client';

import { useEffect, useState } from 'react';
import { DayEditor } from '@/components/DayEditor';
import { formatDay, todayKey } from '@/lib/date';
import { HABITS } from '@/lib/goals';
import type { Entry, Preset } from '@/lib/types';

type Page = { entries: Entry[]; nextCursor: string | null };

/** The one-line preview under the date on a collapsed card. */
function summarise(entry: Entry): string {
  const bits: string[] = [];
  if (entry.weightKg !== null) bits.push(`${entry.weightKg} kg`);
  if (entry.meals.length > 0) {
    bits.push(`${entry.meals.reduce((s, m) => s + (m.protein ?? 0), 0)}g protein`);
  }
  if (entry.meetings.length > 0) bits.push(`${entry.meetings.length} meetings`);
  if (entry.workoutNote) bits.push(entry.workoutNote);
  return bits.length > 0 ? bits.join(' · ') : 'Not logged — tap to fill in';
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/history?today=${todayKey()}`).then((r) => r.json() as Promise<Page>),
      fetch('/api/presets').then((r) => r.json() as Promise<Preset[]>),
    ])
      .then(([page, p]) => {
        setEntries(page.entries);
        setCursor(page.nextCursor);
        setPresets(p);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    const page = (await fetch(`/api/history?before=${cursor}`).then((r) =>
      r.json(),
    )) as Page;
    setEntries((prev) => [...prev, ...page.entries]);
    setCursor(page.nextCursor);
    setLoading(false);
  }

  const today = todayKey();

  return (
    <>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">History</h1>
        <p className="text-sm text-muted">Tap any day to fill it in or fix it.</p>
      </header>

      {!loading && entries.length === 0 && (
        <p className="card text-sm text-muted">
          Nothing logged yet. Start on the Today tab.
        </p>
      )}

      <ul className="space-y-2">
        {entries.map((entry) => {
          const expanded = open === entry.date;
          const stamped = HABITS.filter((h) => entry[h.key]);

          return (
            <li key={entry.date} className="card !p-0">
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : entry.date)}
                aria-expanded={expanded}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{formatDay(entry.date, today)}</p>
                  <p className="truncate text-xs text-muted">{summarise(entry)}</p>
                </div>

                <span aria-hidden className="shrink-0 text-sm tracking-tight">
                  {stamped.map((h) => h.icon).join('') || '—'}
                </span>
                <span
                  aria-hidden
                  className={`shrink-0 text-muted transition-transform ${
                    expanded ? 'rotate-90' : ''
                  }`}
                >
                  ›
                </span>
              </button>

              {expanded && (
                <div className="border-t border-line p-4">
                  {/* Keyed by date so switching days remounts with fresh state. */}
                  <DayEditor
                    key={entry.date}
                    date={entry.date}
                    initialEntry={entry}
                    presets={presets}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {cursor && (
        <button
          type="button"
          className="btn-quiet mt-4 w-full"
          onClick={loadMore}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load older days'}
        </button>
      )}
    </>
  );
}
