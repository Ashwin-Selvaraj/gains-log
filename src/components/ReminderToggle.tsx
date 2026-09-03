'use client';

import { useCallback, useEffect, useState } from 'react';

type PushInfo = {
  configured: boolean;
  missing: string[];
  publicKey: string | null;
  subscriptions: number;
};

type Settings = { reminderEnabled: boolean; reminderTime: string; timezone: string };

type Reminder = { id: string; time: string; label: string; enabled: boolean };

/**
 * The push service wants the VAPID key as raw bytes, not base64url text.
 * Returns an ArrayBuffer rather than a Uint8Array: TypeScript's
 * `applicationServerKey` accepts BufferSource, and a Uint8Array backed by a
 * generic ArrayBufferLike doesn't satisfy it.
 */
function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

/**
 * Real Web Push, not a timer.
 *
 * The previous version scheduled a local notification with setTimeout, which
 * only fired while the app was open — useless as a reminder, since the whole
 * point is to reach you when you have forgotten about it. This subscribes the
 * browser to a push service; the server sends in the evening whether or not
 * the app is running.
 */
export function ReminderToggle({ chrome = 'card' }: { chrome?: 'card' | 'plain' } = {}) {
  // Rendered both as a standalone card and inside the header's notification
  // menu, which supplies its own surface and border.
  const shell = chrome === 'card' ? 'card' : 'p-3';
  const [info, setInfo] = useState<PushInfo | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [newTime, setNewTime] = useState('08:00');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (
      typeof Notification === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      setSupported(false);
      return;
    }

    void (async () => {
      const [push, s, list] = await Promise.all([
        fetch('/api/push').then((r) => r.json() as Promise<PushInfo>),
        fetch('/api/settings').then((r) => r.json() as Promise<Settings>),
        fetch('/api/reminders').then((r) => r.json() as Promise<Reminder[]>),
      ]).catch(() => [null, null, []] as const);

      setInfo(push);
      setSettings(s);
      setReminders(Array.isArray(list) ? list : []);

      const reg = await navigator.serviceWorker.getRegistration();
      const existing = await reg?.pushManager.getSubscription();
      setSubscribed(Boolean(existing));
    })();
  }, []);

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }, []);

  async function enable() {
    setBusy(true);
    setStatus(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus(
          permission === 'denied'
            ? 'Notifications are blocked for this site. Allow them in your browser settings, then try again.'
            : 'Permission was dismissed.',
        );
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        // Required by browsers: every push must show a visible notification.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(info!.publicKey!),
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), userAgent: navigator.userAgent }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Could not register');

      // The server needs the zone to know when it is evening *here*.
      await saveSettings({
        reminderEnabled: true,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setSubscribed(true);
      setStatus('On — this device will get the evening nudge.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not enable notifications');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: 'DELETE',
        }).catch(() => {});
        await sub.unsubscribe();
      }
      await saveSettings({ reminderEnabled: false });
      setSubscribed(false);
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  async function addReminder() {
    setAdding(true);
    setStatus(null);
    try {
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ time: newTime, label: newLabel }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus(json.error ?? 'Could not add that reminder.');
        return;
      }
      setReminders((prev) => [...prev, json].sort((a, b) => a.time.localeCompare(b.time)));
      setNewLabel('');
    } finally {
      setAdding(false);
    }
  }

  async function patchReminder(id: string, patch: Partial<Reminder>) {
    // Applied locally first: a time field that snaps back while the request is
    // in flight feels broken, and the server only ever rejects a malformed
    // time or a clash, both of which are reported below.
    setReminders((prev) =>
      prev
        .map((r) => (r.id === id ? { ...r, ...patch } : r))
        .sort((a, b) => a.time.localeCompare(b.time)),
    );
    const res = await fetch(`/api/reminders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      setStatus((await res.json()).error ?? 'Could not save that reminder.');
      const list = await fetch('/api/reminders').then((r) => r.json());
      setReminders(list);
    }
  }

  async function removeReminder(id: string) {
    setReminders((prev) => prev.filter((r) => r.id !== id));
    await fetch(`/api/reminders/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  async function sendTest() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch('/api/push/test', { method: 'POST' });
      const json = await res.json();
      setStatus(
        res.ok
          ? `Sent to ${json.sent} device${json.sent === 1 ? '' : 's'}.`
          : (json.error ?? 'Test failed'),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <section className={shell}>
        <p className="text-sm font-medium">Evening reminder</p>
        <p className="text-xs text-muted">
          This browser doesn&apos;t support push notifications. On iPhone, add the app to
          your home screen first — Safari only allows them for installed apps.
        </p>
      </section>
    );
  }

  if (info && !info.configured) {
    return (
      <section className={shell}>
        <p className="text-sm font-medium">Evening reminder</p>
        <p className="text-xs text-muted">
          Not set up on the server yet. Run <code>npm run push:keys</code> and add{' '}
          {info.missing.join(' and ')} to <code>.env</code>.
        </p>
      </section>
    );
  }

  return (
    <section className={`${shell} space-y-3`}>
      {/* One master switch for the device, then the schedule. Subscribing is a
          browser permission and belongs to this device; the reminders below
          belong to the account and follow you to any device you allow. */}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Push notifications</p>
          <p className="text-xs text-muted">
            {subscribed
              ? 'On for this device — reminders arrive even with the app closed.'
              : 'Off — turn on to get reminders on this device.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => (subscribed ? disable() : enable())}
          disabled={busy || !info}
          role="switch"
          aria-checked={subscribed}
          aria-label="Push notifications"
          className={`relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-50 ${
            subscribed ? 'bg-accent' : 'bg-line'
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${
              subscribed ? 'left-7' : 'left-1'
            }`}
          />
        </button>
      </div>

      {status && <p className="text-xs text-muted">{status}</p>}

      <div className="border-t border-line pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Reminders
        </p>

        {reminders.length === 0 && (
          <p className="mb-2 text-xs text-muted">
            None yet. Add one below — a morning weigh-in, water at 3pm, logging dinner.
          </p>
        )}

        <ul className="space-y-2">
          {reminders.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <input
                type="time"
                className="field w-[7.75rem] shrink-0 px-2 py-2 text-sm tabular-nums"
                value={r.time}
                aria-label="Reminder time"
                onChange={(e) => void patchReminder(r.id, { time: e.target.value })}
              />
              <input
                className="field min-w-0 flex-1 px-2 py-2 text-sm"
                value={r.label}
                placeholder="What for?"
                aria-label="Reminder label"
                onChange={(e) =>
                  setReminders((prev) =>
                    prev.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)),
                  )
                }
                // Saved on blur rather than per keystroke: a PATCH per letter
                // would be a request storm for a field people type a sentence in.
                onBlur={(e) => void patchReminder(r.id, { label: e.target.value })}
              />
              <button
                type="button"
                role="switch"
                aria-checked={r.enabled}
                aria-label={`Reminder at ${r.time} enabled`}
                onClick={() => void patchReminder(r.id, { enabled: !r.enabled })}
                className={`h-7 w-7 shrink-0 rounded-full border text-xs transition ${
                  r.enabled
                    ? 'border-accent bg-accent text-white'
                    : 'border-line bg-surface text-muted'
                }`}
              >
                <span aria-hidden>{r.enabled ? '✓' : ''}</span>
              </button>
              <button
                type="button"
                aria-label={`Remove reminder at ${r.time}`}
                onClick={() => void removeReminder(r.id)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-line"
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-2 flex items-center gap-2">
          <input
            type="time"
            className="field w-[7.75rem] shrink-0 px-2 py-2 text-sm tabular-nums"
            value={newTime}
            aria-label="New reminder time"
            onChange={(e) => setNewTime(e.target.value)}
          />
          <input
            className="field min-w-0 flex-1 px-2 py-2 text-sm"
            value={newLabel}
            placeholder="Morning weigh-in"
            aria-label="New reminder label"
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <button
            type="button"
            onClick={() => void addReminder()}
            disabled={adding || !newTime}
            aria-label="Add reminder"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-lg text-ink transition active:scale-95 disabled:opacity-40"
          >
            +
          </button>
        </div>

        <p className="mt-2 text-xs leading-relaxed text-muted">
          A reminder with a label says that; one without says what you still
          haven&apos;t logged, and stays quiet on a day that&apos;s already complete.
        </p>
      </div>

      {subscribed && (
        <button
          type="button"
          className="btn-quiet w-full text-sm"
          onClick={sendTest}
          disabled={busy}
        >
          Send a test notification
        </button>
      )}
    </section>
  );
}
