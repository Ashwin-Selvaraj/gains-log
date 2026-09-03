import { NextResponse } from 'next/server';
import { sendToUser, pushConfigured } from '@/lib/push';
import { runRemindersForUser } from '@/lib/reminders';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Fires a notification on demand, so the whole chain can be proven from the
 * phone that will actually receive them rather than assumed to work.
 * `?reminder=1` fires every reminder for real instead of a canned message.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  if (!pushConfigured) {
    return NextResponse.json({ error: 'Push is not configured on the server.' }, { status: 501 });
  }

  if (new URL(req.url).searchParams.get('reminder') === '1') {
    return NextResponse.json(await runRemindersForUser(user.id, { force: true }));
  }

  return NextResponse.json(
    await sendToUser(user.id, {
      title: 'GAINS LOG',
      body: 'Notifications are working. This is what a reminder looks like.',
      url: '/',
      tag: 'test',
    }),
  );
}
