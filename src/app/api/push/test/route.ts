import { NextResponse } from 'next/server';
import { sendToAll, pushConfigured } from '@/lib/push';
import { runEveningReminder } from '@/lib/reminders';

export const dynamic = 'force-dynamic';

/**
 * Fires a notification on demand, so the whole chain can be proven from the
 * phone that will actually receive them rather than assumed to work.
 * `?reminder=1` sends the real evening reminder instead of a canned message.
 */
export async function POST(req: Request) {
  if (!pushConfigured) {
    return NextResponse.json({ error: 'Push is not configured on the server.' }, { status: 501 });
  }

  if (new URL(req.url).searchParams.get('reminder') === '1') {
    return NextResponse.json(await runEveningReminder({ force: true }));
  }

  return NextResponse.json(
    await sendToAll({
      title: 'Gains Log',
      body: 'Notifications are working. This is what an evening nudge looks like.',
      url: '/',
      tag: 'test',
    }),
  );
}
