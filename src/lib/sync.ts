'use client';

/**
 * Every write goes through `mutate`. If the network is down (phone in a lift,
 * plane, dead spot) the request is parked in an ordered outbox in localStorage
 * and replayed when the browser comes back online. Single user, so last-write-
 * wins is exactly the right conflict policy — there is nobody to conflict with.
 */

const OUTBOX_KEY = 'gains-log:outbox';

type Queued = {
  id: string;
  url: string;
  method: string;
  body?: string;
};

type Listener = (pending: number) => void;
const listeners = new Set<Listener>();

function readOutbox(): Queued[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as Queued[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: Queued[]) {
  try {
    window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    /* storage full or blocked — nothing useful to do here */
  }
  listeners.forEach((l) => l(items.length));
}

export function onPendingChange(listener: Listener): () => void {
  listeners.add(listener);
  listener(readOutbox().length);
  return () => listeners.delete(listener);
}

export function pendingCount(): number {
  return readOutbox().length;
}

let flushing = false;

/** Replays queued writes oldest-first. Stops at the first failure so order holds. */
export async function flushOutbox(): Promise<void> {
  if (flushing || typeof window === 'undefined') return;
  flushing = true;
  try {
    let queue = readOutbox();
    while (queue.length > 0) {
      const [next] = queue;
      try {
        const res = await fetch(next.url, {
          method: next.method,
          headers: next.body ? { 'Content-Type': 'application/json' } : undefined,
          body: next.body,
        });
        // A 4xx means this request will never succeed — drop it rather than
        // wedging the queue behind it forever.
        if (!res.ok && res.status < 400) throw new Error(String(res.status));
      } catch {
        break; // still offline; try again on the next online event
      }
      queue = queue.slice(1);
      writeOutbox(queue);
    }
  } finally {
    flushing = false;
  }
}

export class OfflineQueuedError extends Error {
  constructor() {
    super('Saved offline — will sync when you are back online.');
    this.name = 'OfflineQueuedError';
  }
}

/**
 * Performs a write. Resolves with the parsed response when online.
 * Throws `OfflineQueuedError` when the write was queued instead — callers should
 * treat that as "optimistically applied", not as a failure.
 */
export async function mutate<T>(
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  try {
    const res = await fetch(url, {
      method,
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      body: payload,
    });
    if (!res.ok) throw new Error(`${method} ${url} failed: ${res.status}`);
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  } catch (err) {
    // Genuine server errors (4xx/5xx) shouldn't be queued — only transport
    // failures, which is what a rejected fetch means.
    if (err instanceof Error && err.message.includes('failed:')) throw err;
    const queue = readOutbox();
    queue.push({ id: crypto.randomUUID(), url, method, body: payload });
    writeOutbox(queue);
    throw new OfflineQueuedError();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushOutbox());
  void flushOutbox();
}
