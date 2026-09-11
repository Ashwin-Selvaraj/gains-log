/**
 * What an event *is* — no database, no push service, nothing that only exists
 * on a server.
 *
 * Split from events.ts so the settings UI can import the list of kinds without
 * dragging Prisma and web-push into the browser bundle, which is exactly what
 * happened the first time: `Module not found: Can't resolve 'net'`. Same
 * pure-core rule the records module follows — the meaning of a thing has no
 * I/O in it, and only the module that acts on it does.
 */

export const EVENT_KINDS = [
  {
    key: 'pr',
    label: 'Personal records',
    hint: 'The moment you beat a lift.',
  },
  {
    key: 'goal',
    label: 'Daily targets',
    hint: 'When the day’s protein target is met.',
  },
  {
    key: 'streak',
    label: 'Streak milestones',
    hint: 'At 7, 30, 100 and 365 days.',
  },
] as const;

export type EventKind = (typeof EVENT_KINDS)[number]['key'];
export const EVENT_KEYS = EVENT_KINDS.map((e) => e.key) as readonly string[];

/** Tolerant of anything stored: unknown keys are dropped, not thrown on. */
export function parseEnabled(raw: string): EventKind[] {
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter((k): k is EventKind => EVENT_KEYS.includes(k));
}

/** Round numbers worth saying out loud. Anything else passes in silence. */
export const STREAK_MILESTONES = [7, 30, 100, 365] as const;

export function isStreakMilestone(days: number): boolean {
  return (STREAK_MILESTONES as readonly number[]).includes(days);
}
