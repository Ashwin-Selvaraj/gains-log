import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { missingPushConfig, publicKey, pushConfigured } from '@/lib/push';

export const dynamic = 'force-dynamic';

/** What the client needs before it can subscribe: the VAPID public key. */
export async function GET() {
  return NextResponse.json({
    configured: pushConfigured,
    missing: missingPushConfig(),
    publicKey: publicKey(),
    subscriptions: pushConfigured ? await prisma.pushSubscription.count() : 0,
  });
}
