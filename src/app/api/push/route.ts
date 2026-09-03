import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { missingPushConfig, publicKey, pushConfigured } from '@/lib/push';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** What the client needs before it can subscribe: the VAPID public key. */
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  return NextResponse.json({
    configured: pushConfigured,
    missing: missingPushConfig(),
    publicKey: publicKey(),
    subscriptions: pushConfigured
      ? await prisma.pushSubscription.count({ where: { userId: user.id } })
      : 0,
  });
}
