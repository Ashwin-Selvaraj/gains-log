import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { computePracticeStats } from '@/lib/practices';
import { isDateKey, todayKey } from '@/lib/date';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Ticks or unticks one day for one practice. A toggle rather than separate
 * set/unset endpoints because the client only ever has one action — tap the
 * circle — and always knows the current state it's flipping from.
 */
export async function POST(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const body = (await req.json().catch(() => ({}))) as { date?: string };
  const date = body.date && isDateKey(body.date) ? body.date : todayKey();

  const practice = await prisma.habit.findFirst({ where: { id, userId: user.id } });
  if (!practice) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // A date before the practice existed can't be ticked — nothing in the UI
  // offers this today, but the route shouldn't rely on that staying true.
  if (date < practice.startedOn) {
    return NextResponse.json(
      { error: `This practice started on ${practice.startedOn}.` },
      { status: 400 },
    );
  }

  const existing = await prisma.habitLog.findUnique({
    where: { habitId_date: { habitId: id, date } },
  });

  if (existing) {
    await prisma.habitLog.delete({ where: { id: existing.id } });
  } else {
    await prisma.habitLog.create({ data: { habitId: id, userId: user.id, date } });
  }

  const logs = await prisma.habitLog.findMany({
    where: { habitId: id },
    select: { date: true },
  });
  const dates = logs.map((l) => l.date);
  const today = todayKey();

  return NextResponse.json({
    done: dates.includes(date),
    stats: computePracticeStats(dates, practice.startedOn, today),
  });
}
