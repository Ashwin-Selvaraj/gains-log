'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { HABITS } from '@/lib/goals';
import { todayKey } from '@/lib/date';
import type { Entry } from '@/lib/types';

const KEY = 'gains-log:reminder';
const DEFAULT_TIME = '21:00';

/**
 * A local notification, not a push notification. It fires only while the app is
 * open or backgrounded in the browser — a true scheduled push needs a server
 * with VAPID keys and a subscription store, which is a lot of moving parts for
 * a one-person tracker. See the README for what it would take.
 */
export function ReminderToggle() {
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState(DEFAULT_TIME);
  const [supported, setSupported] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (typeof Notification === 'undefined') {
      setSupported(false);
      return;
    }
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { enabled: boolean; time: string };
        setEnabled(saved.enabled && Notification.permission === 'granted');
        setTime(saved.time || DEFAULT_TIME);
      }
    } catch {
      /* ignore malformed state */
    }
  }, []);

  const fire = useCallback(async () => {
    try {
      const entry = (await fetch(`/api/entries/${todayKey()}`).then((r) =>
        r.json(),
      )) as Entry;

      const missing: string[] = HABITS.filter((h) => !entry[h.key]).map((h) => h.label);
      if (entry.weightKg === null) missing.push('Weight');
      if (entry.meals.length === 0) missing.push('Meals');
      if (missing.length === 0) return; // nothing to nag about

      new Notification('Gains Log', {
        body: `Still open today: ${missing.join(', ')}.`,
        icon: '/icon-192.png',
        tag: `gains-${todayKey()}`,
      });
    } catch {
      /* offline — skip tonight rather than showing a wrong reminder */
    }
  }, []);

  // Schedule the next firing; reschedule after each one.
  useEffect(() => {
    clearTimeout(timer.current);
    if (!enabled) return;

    const schedule = () => {
      const [h, m] = time.split(':').map(Number);
      const next = new Date();
      next.setHours(h, m, 0, 0);
      if (next.getTime() <= Date.now()) next.setDate(next.getDate() + 1);

      timer.current = setTimeout(
        () => {
          void fire();
          schedule();
        },
        next.getTime() - Date.now(),
      );
    };

    schedule();
    return () => clearTimeout(timer.current);
  }, [enabled, time, fire]);

  function persist(next: { enabled: boolean; time: string }) {
    localStorage.setItem(KEY, JSON.stringify(next));
  }

  async function toggle() {
    if (enabled) {
      setEnabled(false);
      persist({ enabled: false, time });
      return;
    }
    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    setEnabled(granted);
    persist({ enabled: granted, time });
  }

  if (!supported) return null;

  return (
    <section className="card flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Evening reminder</p>
        <p className="text-xs text-muted">
          {enabled
            ? 'Nudges you if today is incomplete, while the app is open.'
            : 'Off — tap to allow notifications.'}
        </p>
      </div>

      {enabled && (
        <input
          type="time"
          className="field w-28 shrink-0 px-2 py-2 text-sm"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
            persist({ enabled, time: e.target.value });
          }}
          aria-label="Reminder time"
        />
      )}

      <button
        type="button"
        onClick={toggle}
        role="switch"
        aria-checked={enabled}
        aria-label="Evening reminder"
        className={`relative h-8 w-14 shrink-0 rounded-full transition ${
          enabled ? 'bg-accent' : 'bg-line'
        }`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${
            enabled ? 'left-7' : 'left-1'
          }`}
        />
      </button>
    </section>
  );
}
