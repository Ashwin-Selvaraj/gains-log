import { prisma } from '@/lib/prisma';
import { readSettings } from '@/lib/settings';
import { sendToAll } from '@/lib/push';
import { withJoins } from '@/lib/db-strategy';
import type { DateKey } from '@/lib/date';

export const EVENING_REMINDER = 'evening-reminder';

/**
 * The user's local date and minute-of-day, in *their* timezone.
 *
 * The server runs wherever it runs — "is it 9pm yet" is only answerable against
 * the zone the person is actually in, so it is stored in Settings rather than
 * assumed from the host.
 */
export function localNow(timezone: string, at = new Date()): { date: DateKey; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  // en-CA gives ISO-ordered date parts, which is why it's used here.
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  // 24:00 appears in some environments for midnight; fold it back to 0.
  const hour = Number(get('hour')) % 24;
  return { date, minutes: hour * 60 + Number(get('minute')) };
}

export function parseHHMM(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return 21 * 60;
  return (Number(m[1]) % 24) * 60 + (Number(m[2]) % 60);
}

/** What's still missing from a day, in the order it's worth mentioning. */
export function missingFrom(entry: {
  workoutDone: boolean;
  learningDone: boolean;
  sleptWell: boolean;
  waterDone: boolean;
  weightKg: number | null;
  meals: unknown[];
  sets: unknown[];
} | null): string[] {
  if (!entry) return ['Everything — nothing logged today'];

  const missing: string[] = [];
  if (!entry.workoutDone && entry.sets.length === 0) missing.push('Workout');
  if (entry.meals.length === 0) missing.push('Meals');
  if (entry.weightKg === null) missing.push('Weight');
  if (!entry.waterDone) missing.push('Water');
  if (!entry.learningDone) missing.push('Learning');
  return missing;
}

export type ReminderRun = {
  ran: boolean;
  reason: string;
  sent?: number;
  removed?: number;
  failed?: number;
  missing?: string[];
};

/**
 * Decides whether the evening reminder is due, and sends it if so.
 *
 * Written to be called repeatedly — the scheduler polls every few minutes
 * rather than firing on an exact tick, so that a restart at 20:59 doesn't lose
 * the day's reminder. Everything below is a guard that makes a second call in
 * the same evening a no-op.
 */
export async function runEveningReminder(
  opts: { force?: boolean; at?: Date } = {},
): Promise<ReminderRun> {
  const settings = await readSettings();

  if (!settings.reminderEnabled && !opts.force) {
    return { ran: false, reason: 'reminders are switched off' };
  }

  const { date, minutes } = localNow(settings.timezone, opts.at);
  const due = parseHHMM(settings.reminderTime);

  if (!opts.force && minutes < due) {
    return { ran: false, reason: `not due yet (local ${fmt(minutes)}, due ${fmt(due)})` };
  }

  // Past roughly midnight the nudge is pointless and would arrive as the day
  // it refers to is already over.
  if (!opts.force && minutes > due + 180) {
    return { ran: false, reason: 'window has passed for today' };
  }

  const entry = await prisma.dailyEntry.findUnique({
    where: { date },
    include: { meals: true, sets: true },
    ...withJoins,
  });

  const missing = missingFrom(entry);
  if (missing.length === 0) {
    return { ran: false, reason: 'the day is already complete', missing };
  }

  // The unique (kind, date) index is the idempotency guard: if the insert
  // fails, this evening's reminder has already gone out.
  try {
    await prisma.notificationLog.create({ data: { kind: EVENING_REMINDER, date } });
  } catch {
    return { ran: false, reason: 'already sent today', missing };
  }

  const result = await sendToAll({
    title: 'Gains Log',
    body:
      missing.length === 1
        ? `Still open today: ${missing[0]}.`
        : `Still open today: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`,
    url: '/',
    tag: `${EVENING_REMINDER}-${date}`,
  });

  await prisma.notificationLog.update({
    where: { kind_date: { kind: EVENING_REMINDER, date } },
    data: { reached: result.sent },
  });

  return { ran: true, reason: 'sent', missing, ...result };
}

const fmt = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
