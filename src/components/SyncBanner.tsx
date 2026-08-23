'use client';

import { useEffect, useState } from 'react';
import { flushOutbox, onPendingChange } from '@/lib/sync';

/** Only visible when there is something the user should know about. */
export function SyncBanner() {
  const [pending, setPending] = useState(0);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => {
      setOnline(true);
      void flushOutbox();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const unsubscribe = onPendingChange(setPending);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      unsubscribe();
    };
  }, []);

  if (online && pending === 0) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-50 bg-amber-500/15 px-4 py-2 text-center text-sm text-amber-700
                 dark:text-amber-300"
    >
      {online
        ? `Syncing ${pending} pending change${pending === 1 ? '' : 's'}…`
        : pending > 0
          ? `Offline — ${pending} change${pending === 1 ? '' : 's'} will sync when you reconnect.`
          : 'Offline — showing your last synced data.'}
    </div>
  );
}
