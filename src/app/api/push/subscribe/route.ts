import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pushConfigured } from '@/lib/push';
import { requireUser, unauthorized } from '@/lib/auth';
import { logDeletion } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type SubBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  userAgent?: string;
};

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  if (!pushConfigured) {
    return NextResponse.json({ error: 'Push is not configured on the server.' }, { status: 501 });
  }

  const body = (await req.json()) as SubBody;
  const endpoint = String(body.endpoint ?? '');
  const p256dh = String(body.keys?.p256dh ?? '');
  const auth = String(body.keys?.auth ?? '');

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'incomplete subscription' }, { status: 400 });
  }

  // Upsert on endpoint: a browser re-subscribing hands back the same endpoint,
  // and a second row would mean the same phone buzzing twice.
  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: user.id,
      endpoint,
      p256dh,
      auth,
      userAgent: String(body.userAgent ?? '').slice(0, 300),
    },
    // userId is updated too: a shared device re-subscribed by a different
    // person must move to them, not keep notifying the previous owner.
    update: { userId: user.id, p256dh, auth, failureCount: 0 },
  });

  return NextResponse.json({ id: sub.id }, { status: 201 });
}

export async function DELETE(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const endpoint = new URL(req.url).searchParams.get('endpoint');
  if (endpoint) {
    const { count } = await prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: user.id },
    });
    if (count) logDeletion(user.email, 'push subscription', endpoint.slice(0, 60) + '…');
  }
  return new NextResponse(null, { status: 204 });
}
