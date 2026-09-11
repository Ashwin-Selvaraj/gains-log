'use client';

import { useEffect, useState } from 'react';

type Toast = { id: number; title: string; body: string; url: string };

/**
 * Shows an event that arrived while the app was open, in the app.
 *
 * The service worker hands events to a focused window instead of raising a
 * system notification (see deliver() in public/sw.js), because a banner from
 * the OS about something the screen in front of you just did is the fastest
 * way to get notifications turned off. This is where those handed-over events
 * land — the same words, in the place you are already looking.
 */
export function EventToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    function onMessage(e: MessageEvent) {
      const d = e.data as { type?: string; title?: string; body?: string; url?: string };
      if (d?.type !== 'gains-event') return;

      const toast: Toast = {
        id: Date.now() + Math.random(),
        title: d.title ?? 'Gains Log',
        body: d.body ?? '',
        url: d.url ?? '/',
      };
      setToasts((prev) => [...prev, toast]);
      // Long enough to read twice, short enough not to sit over the thing you
      // came back to do.
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), 6000);
    }

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-24 z-50 flex flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <a
          key={t.id}
          href={t.url}
          className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line bg-card px-4 py-3 shadow-lg"
        >
          <span aria-hidden className="text-lg leading-none">🏆</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t.title}</span>
            <span className="block text-xs text-muted">{t.body}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
