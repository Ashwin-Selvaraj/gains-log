import { NextResponse } from 'next/server';
import { getQuota } from '@/lib/ai-quota';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** So the photo screen can show what's left before spending one. */
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  return NextResponse.json(await getQuota(user));
}
