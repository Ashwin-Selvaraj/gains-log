import { prisma } from '@/lib/prisma';
import { readSettings } from '@/lib/settings';
import { sendToUser } from '@/lib/push';
import { withJoins } from '@/lib/db-strategy';
import type { DateKey } from '@/lib/date';

/** Prefix for NotificationLog.kind; the reminder's time is appended. */
export const REMINDER_KIND = 'reminder';

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

/** How long after its time a reminder may still fire, in minutes.
 *  A poll every few minutes only needs a little slack; a wide window would let
 *  an 8am nudge arrive at 11 and collide with the next one. */
const WINDOW_MINUTES = 90;

/**
 * Decides whether one reminder is due, and sends it if so.
 *
 * Written to be called repeatedly — the scheduler polls every few minutes
 * rather than firing on an exact tick, so a restart at 20:59 doesn't lose the
 * day's reminder. Everything below is a guard that makes a second call in the
 * same window a no-op.
 */
export async function runReminder(
  userId: string,
  reminder: { id: string; time: string; label: string; enabled: boolean },
  opts: { force?: boolean; at?: Date } = {},
): Promise<ReminderRun> {
  const settings = await readSettings(userId);

  if (!settings.reminderEnabled && !opts.force) {
    return { ran: false, reason: 'notifications are switched off' };
  }
  if (!reminder.enabled && !opts.force) {
    return { ran: false, reason: 'this reminder is switched off' };
  }

  const { date, minutes } = localNow(settings.timezone, opts.at);
  const due = parseHHMM(reminder.time);

  if (!opts.force && minutes < due) {
    return { ran: false, reason: `not due yet (local ${fmt(minutes)}, due ${fmt(due)})` };
  }
  if (!opts.force && minutes > due + WINDOW_MINUTES) {
    return { ran: false, reason: 'window has passed for today' };
  }

  const entry = await prisma.dailyEntry.findFirst({
    where: { userId, date },
    include: { meals: true, sets: true },
    ...withJoins,
  });
  const missing = missingFrom(entry);

  /**
   * A labelled reminder is an alarm: "drink water" is worth saying whether or
   * not the day is otherwise complete. An unlabelled one is the original
   * behaviour — a nudge about what is still unlogged — and has nothing to say
   * once nothing is missing.
   */
  const label = reminder.label.trim();
  if (!label && missing.length === 0 && !opts.force) {
    return { ran: false, reason: 'the day is already complete', missing };
  }

  // The unique (kind, date) index is the idempotency guard: if the insert
  // fails, this reminder has already gone out today. The time is part of the
  // kind, so several reminders a day each get their own guard.
  const kind = `${REMINDER_KIND}-${reminder.time}`;
  try {
    await prisma.notificationLog.create({ data: { userId, kind, date } });
  } catch {
    return { ran: false, reason: 'already sent today', missing };
  }

  const body = label
    ? label
    : missing.length === 1
      ? `Still open today: ${missing[0]}.`
      : `Still open today: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`;

  const result = await sendToUser(userId, {
    title: 'GAINS LOG',
    body,
    url: '/',
    tag: `${kind}-${date}`,
  });

  await prisma.notificationLog.update({
    where: { userId_kind_date: { userId, kind, date } },
    data: { reached: result.sent },
  });

  return { ran: true, reason: 'sent', missing, ...result };
}

/** Runs every reminder this user has set. */
export async function runRemindersForUser(
  userId: string,
  opts: { force?: boolean; at?: Date } = {},
): Promise<ReminderRun[]> {
  const reminders = await prisma.reminder.findMany({
    where: { userId },
    orderBy: { time: 'asc' },
  });
  const runs: ReminderRun[] = [];
  for (const reminder of reminders) {
    runs.push(await runReminder(userId, reminder, opts));
  }
  return runs;
}

const fmt = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Runs the reminder for everyone who has one switched on.
 *
 * Each user is evaluated against their own timezone and reminder time, so a
 * single poll serves people in different zones correctly. One user's failure
 * must not stop the others, hence the per-user try.
 */
export async function runRemindersForAllUsers(
  opts: { at?: Date } = {},
): Promise<{ checked: number; sent: number }> {
  const users = await prisma.settings.findMany({
    where: { reminderEnabled: true },
    select: { userId: true },
  });

  let sent = 0;
  for (const { userId } of users) {
    try {
      const runs = await runRemindersForUser(userId, opts);
      sent += runs.filter((r) => r.ran).length;
    } catch (err) {
      console.error(`[reminders] user ${userId} failed`, err);
    }
  }
  return { checked: users.length, sent };
}
