import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { computePracticeStats } from '@/lib/practices';
import { isDateKey, todayKey } from '@/lib/date';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** A generous but finite cap — this is a short daily checklist, not a project tracker. */
const MAX_PRACTICES = 20;

/**
 * Active practices for Today, each with its stats computed from the log rows.
 * Archived ones are omitted here — they're only reachable to be restored, not
 * shown alongside what's actually being tracked.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const param = new URL(req.url).searchParams.get('today');
  const today = param && isDateKey(param) ? param : todayKey();

  const practices = await prisma.habit.findMany({
    where: { userId: user.id, archived: false },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: { logs: { select: { date: true } } },
  });

  return NextResponse.json(
    practices.map((p) => {
      const dates = p.logs.map((l) => l.date);
      return {
        id: p.id,
        name: p.name,
        icon: p.icon,
        position: p.position,
        todayDone: dates.includes(today),
        stats: computePracticeStats(dates, p.startedOn, today),
      };
    }),
  );
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as { name?: string; icon?: string; today?: string };
  const name = String(body.name ?? '').trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: 'Name required.' }, { status: 400 });

  // A single emoji, or nothing — a stray "not an emoji" string in this slot
  // would sit oddly next to the name on Today.
  // Not a checkmark: that shape is what the tap circle itself turns into
  // once you've done it today, and a default icon that already looks done
  // would make every fresh practice look ticked at a glance.
  const icon = String(body.icon ?? '').trim().slice(0, 8) || '🔥';

  // The client's own local date, not the server's — see the schema comment on
  // Habit.startedOn for why deriving this from the server clock is wrong.
  const startedOn = body.today && isDateKey(body.today) ? body.today : todayKey();

  const count = await prisma.habit.count({ where: { userId: user.id, archived: false } });
  if (count >= MAX_PRACTICES) {
    return NextResponse.json(
      { error: `That's the limit of ${MAX_PRACTICES} practices — archive one first.` },
      { status: 400 },
    );
  }

  const last = await prisma.habit.findFirst({
    where: { userId: user.id },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const practice = await prisma.habit.create({
    data: { userId: user.id, name, icon, startedOn, position: (last?.position ?? -1) + 1 },
  });

  return NextResponse.json(
    {
      id: practice.id,
      name: practice.name,
      icon: practice.icon,
      position: practice.position,
      todayDone: false,
      stats: computePracticeStats([], startedOn, startedOn),
    },
    { status: 201 },
  );
}
