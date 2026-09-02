import webpush from 'web-push';
import { prisma } from '@/lib/prisma';

/**
 * Web Push delivery.
 *
 * VAPID is how a push service (FCM for Chrome, Mozilla's for Firefox, Apple's
 * for Safari) knows the notification really came from this server. The keypair
 * is generated once with `npm run push:keys` and lives in .env — regenerating
 * it invalidates every existing subscription, so it is generated once and left
 * alone.
 */

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim();
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim();
/** Contact address the push service can use if something is wrong. */
const SUBJECT = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@example.com';

export const pushConfigured = Boolean(PUBLIC_KEY && PRIVATE_KEY);

if (pushConfigured) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY!, PRIVATE_KEY!);
}

export function publicKey(): string | null {
  return PUBLIC_KEY ?? null;
}

export function missingPushConfig(): string[] {
  return [
    ['VAPID_PUBLIC_KEY', PUBLIC_KEY],
    ['VAPID_PRIVATE_KEY', PRIVATE_KEY],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k as string);
}

export type PushPayload = {
  title: string;
  body: string;
  /** Where tapping it should land. */
  url?: string;
  /** Collapses older notifications with the same tag instead of stacking. */
  tag?: string;
};

/**
 * Sends to every stored subscription.
 *
 * Failures are not equal: 404 and 410 mean the browser threw the subscription
 * away (uninstalled, permission revoked) and it should be deleted, while a 5xx
 * is the push service having a bad minute and should be retried later. Deleting
 * on a transient error would silently unsubscribe someone.
 */
export async function sendToAll(payload: PushPayload): Promise<{
  sent: number;
  removed: number;
  failed: number;
}> {
  if (!pushConfigured) return { sent: 0, removed: 0, failed: 0 };

  const subs = await prisma.pushSubscription.findMany();
  let sent = 0;
  let removed = 0;
  let failed = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          { TTL: 6 * 60 * 60 }, // a reminder is worthless tomorrow morning
        );
        sent++;
        await prisma.pushSubscription.update({
          where: { id: sub.id },
          data: { lastSentAt: new Date(), failureCount: 0 },
        });
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode;

        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          removed++;
          return;
        }

        failed++;
        const next = sub.failureCount + 1;
        // Five consecutive failures is not a bad minute any more.
        if (next >= 5) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
          removed++;
        } else {
          await prisma.pushSubscription
            .update({ where: { id: sub.id }, data: { failureCount: next } })
            .catch(() => {});
        }
      }
    }),
  );

  return { sent, removed, failed };
}
