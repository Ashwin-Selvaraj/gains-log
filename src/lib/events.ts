import { prisma } from '@/lib/prisma';
import { sendToUser } from '@/lib/push';
import { parseEnabled, type EventKind } from '@/lib/event-kinds';

export { EVENT_KINDS, EVENT_KEYS, parseEnabled, isStreakMilestone, STREAK_MILESTONES } from '@/lib/event-kinds';
export type { EventKind } from '@/lib/event-kinds';

/**
 * Things worth knowing the moment they happen, rather than at 9pm.
 *
 * The reminder in src/lib/reminders.ts answers "have you logged today" on a
 * clock. This answers "something just became true" — a lift beaten, a target
 * met, a streak reaching a round number. They are different mechanisms on
 * purpose: a reminder is due at a time and must fire once that day; an event
 * is caused by a write and must fire once per thing.
 *
 * Delivery is decided on the device, not here. A push about what you just did
 * on the phone in your hand would be noise — you are looking at the screen that
 * already said it. The service worker therefore shows an OS notification only
 * when no window is focused, and otherwise hands the event to the open page.
 * See the push handler in public/sw.js.
 */

type Emit = {
  kind: EventKind;
  /**
   * What this event is *about* — an exercise key, a target name, a habit id.
   * Combined with the kind and the date it forms the idempotency key, so
   * beating the bench twice in one session notifies once, while beating the
   * bench and the squat notifies twice.
   */
  subject: string;
  date: string;
  title: string;
  body: string;
  url?: string;
};

/**
 * Sends one event, at most once per subject per day.
 *
 * Never throws and never rejects: every caller is a write path whose real job
 * has already succeeded by the time this runs. A push failing must not turn a
 * logged set into a 500.
 */
export async function emitEvent(userId: string, event: Emit): Promise<void> {
  try {
    const settings = await prisma.settings.findUnique({
      where: { userId },
      select: { notifyEvents: true },
    });
    if (!settings) return;
    if (!parseEnabled(settings.notifyEvents).includes(event.kind)) return;

    // The unique index is the guard, exactly as it is for reminders: the insert
    // failing *is* the answer that this one has already gone out. Checking
    // first and then inserting would leave a race open between two writes
    // landing in the same second.
    const kind = `evt:${event.kind}:${event.subject}`;
    try {
      await prisma.notificationLog.create({ data: { userId, kind, date: event.date } });
    } catch {
      return;
    }

    const result = await sendToUser(userId, {
      title: event.title,
      body: event.body,
      url: event.url ?? '/',
      tag: `${kind}-${event.date}`,
      event: event.kind,
    });

    await prisma.notificationLog
      .update({
        where: { userId_kind_date: { userId, kind, date: event.date } },
        data: { reached: result.sent },
      })
      .catch(() => {});
  } catch (err) {
    console.error('[events] emit failed', err);
  }
}

/**
 * Fire-and-forget from a write path.
 *
 * The response should not wait on a round trip to a push service while someone
 * is standing at a rack mid-set. This process is long-lived (`next start`
 * under systemd), so a floating promise does finish — this would need to be
 * `await`ed or handed to a queue on a serverless runtime, where the process
 * can be frozen the moment the response is returned.
 */
export function emitEventInBackground(userId: string, event: Emit): void {
  void emitEvent(userId, event);
}
