'use client';

import { useEffect, useState } from 'react';
import { DayEditor } from '@/components/DayEditor';
import { ReminderToggle } from '@/components/ReminderToggle';
import { todayKey } from '@/lib/date';
import type { Entry, Preset } from '@/lib/types';

/**
 * Rendered on the client because "today" must be the *user's* today. A server
 * render would use the deployment region's timezone, which is how trackers end
 * up logging your Tuesday morning workout against Monday.
 */
export default function TodayPage() {
  const [date, setDate] = useState<string | null>(null);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const key = todayKey();
    setDate(key);

    Promise.all([
      fetch(`/api/entries/${key}`).then((r) => r.json() as Promise<Entry>),
      fetch('/api/presets').then((r) => r.json() as Promise<Preset[]>),
    ])
      .then(([e, p]) => {
        setEntry(e);
        setPresets(p);
      })
      .catch(() => setFailed(true));
  }, []);

  const heading = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
    : '';

  return (
    <>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Today</h1>
        <p className="text-sm text-muted">{heading || ' '}</p>
      </header>

      {failed && (
        <p className="card text-sm text-muted">
          Couldn&apos;t load today&apos;s entry. If you&apos;re offline, reconnect and pull
          to refresh.
        </p>
      )}

      {!entry && !failed && <SkeletonDay />}

      {entry && date && (
        <>
          <DayEditor date={date} initialEntry={entry} presets={presets} showTargets />
          <div className="mt-4">
            <ReminderToggle />
          </div>
        </>
      )}
    </>
  );
}

function SkeletonDay() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-line/60" />
        ))}
      </div>
      <div className="h-40 animate-pulse rounded-2xl bg-line/60" />
      <div className="h-32 animate-pulse rounded-2xl bg-line/60" />
    </div>
  );
}
