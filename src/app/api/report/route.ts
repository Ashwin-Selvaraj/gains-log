import { NextResponse } from 'next/server';
import { buildWeeklyReport } from '@/lib/report';
import { isDateKey, todayKey } from '@/lib/date';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  // The client passes its own local date so the report window matches the
  // user's day, not the server's.
  const param = new URL(req.url).searchParams.get('today');
  const today = param && isDateKey(param) ? param : todayKey();
  return NextResponse.json(await buildWeeklyReport(user.id, today));
}
