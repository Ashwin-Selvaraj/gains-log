/**
 * Dates are "YYYY-MM-DD" strings throughout, always in the *local* timezone of
 * whoever is looking. That's what makes "today" mean the same thing on a phone
 * in IST and a server in UTC.
 */
export type DateKey = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateKey(value: string): value is DateKey {
  return ISO_DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

export function toDateKey(d: Date): DateKey {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(): DateKey {
  return toDateKey(new Date());
}

export function addDays(key: DateKey, delta: number): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  return toDateKey(new Date(y, m - 1, d + delta));
}

/** The last `count` days ending at `end`, oldest first. */
export function dateRange(end: DateKey, count: number): DateKey[] {
  return Array.from({ length: count }, (_, i) => addDays(end, i - (count - 1)));
}

export function formatDay(key: DateKey, today = todayKey()): string {
  if (key === today) return 'Today';
  if (key === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}
