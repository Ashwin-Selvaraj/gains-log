import { NextResponse } from 'next/server';
import { buildProfile } from '@/lib/account';
import { isDateKey, todayKey } from '@/lib/date';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  // The client passes its own local date, so "today" matches the phone's day
  // rather than the server's — the same reason the report does.
  const param = new URL(req.url).searchParams.get('today');
  const today = param && isDateKey(param) ? param : todayKey();
  return NextResponse.json(await buildProfile(user.id, today));
}
