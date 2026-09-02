/*
 * Gains Log service worker.
 *
 * Goal is modest and specific: everything you've already looked at stays
 * readable with no signal, and writes made offline are replayed by the app's
 * own outbox (src/lib/sync.ts) rather than by Background Sync — iOS Safari
 * still doesn't support the latter.
 */

const VERSION = 'v1';
const SHELL = `gains-shell-${VERSION}`;
const DATA = `gains-data-${VERSION}`;
const ROUTES = ['/', '/meals', '/report', '/history'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // Individually, so one 404 during a deploy doesn't fail the whole install.
      await Promise.allSettled(ROUTES.map((r) => cache.add(r)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL && k !== DATA)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Network first, falling back to whatever we cached last. */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

/** Build output is content-hashed, so a hit is always correct. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // writes are the outbox's job

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The photo estimate is useless without a network — don't cache the attempt.
  if (url.pathname === '/api/estimate') return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, SHELL));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, DATA));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      networkFirst(request, SHELL).catch(
        async () => (await caches.match('/')) ?? Response.error(),
      ),
    );
  }
});


/* ── Push notifications ───────────────────────────────────────────────────
   The service worker is the only thing running when the app is closed, which
   is the whole point: a reminder that only fires while you already have the
   app open is not a reminder. */

self.addEventListener('push', (event) => {
  // A push with no payload still deserves something rather than nothing —
  // some services send an empty wake-up.
  let data = { title: 'Gains Log', body: 'Time to log today.', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Same tag replaces an older unread reminder instead of stacking three
      // of them by Friday.
      tag: data.tag || 'gains-log',
      renotify: true,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      // Focus an open tab rather than opening a second copy of the app.
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
