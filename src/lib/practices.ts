import { addDays, daysBetween, type DateKey } from '@/lib/date';

/**
 * Streak and duration maths for a user-defined daily practice — "Post on
 * Twitter", "Talk to someone", anything that isn't one of the four built-in
 * habits on DailyEntry.
 *
 * Pure and DB-free, mirroring computeStreaks in src/lib/profile.ts: streaks
 * are computed from the log rows on every read, never stored, so deleting a
 * mis-tapped tick self-corrects the streak instead of leaving a cached number
 * wrong.
 */

export type PracticeStats = {
  /** Consecutive logged days ending today (or yesterday — see atRisk). */
  current: number;
  /** Best run ever. */
  longest: number;
  /**
   * True when today itself isn't ticked yet but yesterday was, so the streak
   * is alive but at risk. Matters at 9pm: "12 days, tick today to keep it" is
   * useful, "12 days" alone reads as already broken or already safe.
   */
  atRisk: boolean;
  /** How many days it's been since this practice was created. */
  daysTracked: number;
  /** Total days it's actually been ticked, out of daysTracked. */
  totalTicks: number;
};

/**
 * @param logDates Dates this practice was ticked, any order, may include
 *   duplicates.
 * @param startedOn The date the practice was created — nothing before this
 *   counts, so a practice started three days ago can't claim a longer streak.
 */
export function computePracticeStats(
  logDates: DateKey[],
  startedOn: DateKey,
  today: DateKey,
): PracticeStats {
  const logged = new Set(logDates);

  // Counting back from today would report zero all morning, before anything
  // has been ticked — so if today is blank, count back from yesterday and
  // flag the streak as at risk rather than pretending it already broke.
  const todayLogged = logged.has(today);
  const anchor = todayLogged ? today : addDays(today, -1);
  const atRisk = !todayLogged && logged.has(anchor);

  let current = 0;
  for (
    let cursor = anchor;
    cursor >= startedOn && logged.has(cursor);
    cursor = addDays(cursor, -1)
  ) {
    current++;
  }

  let longest = 0;
  let run = 0;
  let previous: DateKey | null = null;
  for (const date of [...logged].sort()) {
    run = previous && daysBetween(previous, date) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  return {
    current,
    longest,
    atRisk,
    daysTracked: Math.max(1, daysBetween(startedOn, today) + 1),
    totalTicks: logged.size,
  };
}
