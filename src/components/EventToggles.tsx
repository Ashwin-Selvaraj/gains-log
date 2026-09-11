'use client';

import { useEffect, useState } from 'react';
import { EVENT_KINDS, parseEnabled, type EventKind } from '@/lib/event-kinds';

/**
 * Which events are worth interrupting you for.
 *
 * Separate switches rather than one "event notifications" toggle, because the
 * three are not equally welcome: a personal record is a reward, a protein
 * target is information, a streak milestone is neither if you do not care about
 * streaks. One switch would force the least wanted of them to decide the fate
 * of the other two.
 */
export function EventToggles() {
  const [enabled, setEnabled] = useState<EventKind[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((s: { notifyEvents?: string }) => setEnabled(parseEnabled(s.notifyEvents ?? '')))
      .catch(() => setError('Could not load these.'));
  }, []);

  async function toggle(key: EventKind) {
    const next = enabled!.includes(key)
      ? enabled!.filter((k) => k !== key)
      : [...enabled!, key];
    // Applied first: a switch that waits for a round trip before moving feels
    // broken, and the server is not going to disagree about a list of strings.
    setEnabled(next);
    setError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyEvents: next.join(',') }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setEnabled(enabled);
      setError('That did not save — try again.');
    }
  }

  return (
    <div className="border-t border-line p-3">
      <p className="mb-1 text-sm font-medium">As it happens</p>
      <p className="mb-2.5 text-xs text-muted">
        Pushed the moment they happen. Shown in the app instead if you already have it open.
      </p>

      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex flex-col gap-1.5">
        {EVENT_KINDS.map((e) => (
          <label key={e.key} className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
              checked={enabled?.includes(e.key) ?? false}
              disabled={enabled === null}
              onChange={() => void toggle(e.key)}
            />
            <span className="min-w-0">
              <span className="block text-sm">{e.label}</span>
              <span className="block text-xs text-muted">{e.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
