'use client';

import { useCallback, useEffect, useState } from 'react';

type PushInfo = {
  configured: boolean;
  missing: string[];
  publicKey: string | null;
  subscriptions: number;
};

type Settings = { reminderEnabled: boolean; reminderTime: string; timezone: string };

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
      const [push, s] = await Promise.all([
        fetch('/api/push').then((r) => r.json() as Promise<PushInfo>),
        fetch('/api/settings').then((r) => r.json() as Promise<Settings>),
      ]).catch(() => [null, null] as const);

      setInfo(push);
      setSettings(s);

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
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Evening reminder</p>
          <p className="text-xs text-muted">
            {subscribed
              ? 'Nudges this device if the day is still incomplete — even with the app closed.'
              : 'Off — tap to get a nudge when the day is still unlogged.'}
          </p>
        </div>

        {subscribed && settings && (
          <input
            type="time"
            className="field w-28 shrink-0 px-2 py-2 text-sm"
            value={settings.reminderTime}
            onChange={(e) => void saveSettings({ reminderTime: e.target.value })}
            aria-label="Reminder time"
          />
        )}

        <button
          type="button"
          onClick={() => (subscribed ? disable() : enable())}
          disabled={busy || !info}
          role="switch"
          aria-checked={subscribed}
          aria-label="Evening reminder"
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
