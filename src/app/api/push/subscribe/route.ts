import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pushConfigured } from '@/lib/push';

export const dynamic = 'force-dynamic';

type SubBody = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
  userAgent?: string;
};

export async function POST(req: Request) {
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
      endpoint,
      p256dh,
      auth,
      userAgent: String(body.userAgent ?? '').slice(0, 300),
    },
    update: { p256dh, auth, failureCount: 0 },
  });

  return NextResponse.json({ id: sub.id }, { status: 201 });
}

export async function DELETE(req: Request) {
  const endpoint = new URL(req.url).searchParams.get('endpoint');
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  }
  return new NextResponse(null, { status: 204 });
}
