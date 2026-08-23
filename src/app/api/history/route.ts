import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { blankEntry, isEmptyEntry } from '@/lib/entries';
import { dateRange, isDateKey, todayKey, type DateKey } from '@/lib/date';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const take = Math.min(Number(params.get('limit') ?? 30) || 30, 120);
  const before = params.get('before'); // exclusive date cursor
  const todayParam = params.get('today');
  const today = todayParam && isDateKey(todayParam) ? todayParam : todayKey();

  const rows = await prisma.dailyEntry.findMany({
    where: before ? { date: { lt: before } } : undefined,
    include: {
      meetings: { orderBy: { time: 'asc' } },
      meals: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { date: 'desc' },
    take: take + 1,
  });

  const page = rows.slice(0, take);
  const nextCursor = rows.length > take ? page[page.length - 1].date : null;

  // Rows are created on first touch, so a day that was opened and abandoned
  // would otherwise show as a blank card.
  const logged = page.filter((e) => !isEmptyEntry(e));

  if (before) {
    return NextResponse.json({ entries: logged, nextCursor });
  }

  // First page: always show the last 7 calendar days, logged or not, so a day
  // that was missed entirely can still be filled in.
  const recent = new Set(dateRange(today, 7));
  const byDate = new Map(logged.map((e) => [e.date, e as unknown]));

  const entries = [
    ...dateRange(today, 7)
      .reverse()
      .map((d) => byDate.get(d) ?? blankEntry(d)),
    ...logged.filter((e) => !recent.has(e.date)),
  ];

  return NextResponse.json({ entries, nextCursor });
}
