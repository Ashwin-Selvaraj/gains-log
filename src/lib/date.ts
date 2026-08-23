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

/**
 * ISO-8601 week identifier, e.g. "2026-W34". A week belongs to the year
 * containing its Thursday, which is why this can't just read the date's own
 * year — 1 Jan 2027 falls in 2026-W53.
 */
export function isoWeekKey(key: DateKey): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  // Shift to the Thursday of this week (Monday = 0).
  const mondayIndex = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayIndex + 3);

  const weekYear = date.getFullYear();
  // 4 January is always in week 1.
  const jan4 = new Date(weekYear, 0, 4);
  const jan4Monday = (jan4.getDay() + 6) % 7;
  const week1Thursday = new Date(weekYear, 0, 4 - jan4Monday + 3);

  const week =
    1 + Math.round((date.getTime() - week1Thursday.getTime()) / (7 * 86_400_000));
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}

/** Whole days between two date keys (b - a). */
export function daysBetween(a: DateKey, b: DateKey): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const ms = new Date(by, bm - 1, bd).getTime() - new Date(ay, am - 1, ad).getTime();
  return Math.round(ms / 86_400_000);
}
