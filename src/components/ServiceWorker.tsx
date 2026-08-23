'use client';

import { useEffect } from 'react';

export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Registering in dev would cache the dev server's unstable chunks.
    if (process.env.NODE_ENV !== 'production') return;
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker registration failed', err);
    });
  }, []);

  return null;
}
