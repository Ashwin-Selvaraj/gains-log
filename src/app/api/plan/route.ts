import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withJoins } from '@/lib/db-strategy';
import { exerciseKey } from '@/lib/prs';

export const dynamic = 'force-dynamic';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** Returns all seven weekdays, filling in any the user hasn't set up yet. */
export async function GET() {
  const days = await prisma.planDay.findMany({
    include: { exercises: { orderBy: { position: 'asc' } } },
    orderBy: { weekday: 'asc' },
    ...withJoins,
  });

  const byWeekday = new Map(days.map((d) => [d.weekday, d]));
  return NextResponse.json(
    WEEKDAYS.map(
      (weekday) =>
        byWeekday.get(weekday) ?? { id: '', weekday, name: 'Rest', exercises: [] },
    ),
  );
}

/**
 * Replaces one weekday's session wholesale. The alternative — diffing exercise
 * rows against what the client sent — buys nothing here: a plan day holds a
 * handful of rows and the editor always submits the whole list.
 */
export async function PUT(req: Request) {
  const body = (await req.json()) as {
    weekday?: number;
    name?: string;
    exercises?: { name?: string; sets?: number; reps?: string }[];
  };

  const weekday = Number(body.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return NextResponse.json({ error: 'weekday must be 0-6' }, { status: 400 });
  }

  const name = String(body.name ?? '').trim().slice(0, 60) || 'Rest';

  const exercises = (body.exercises ?? [])
    .map((e, i) => ({
      name: String(e.name ?? '').trim().slice(0, 100),
      exerciseKey: exerciseKey(String(e.name ?? '')),
      sets: Math.min(Math.max(Math.round(Number(e.sets) || 3), 1), 20),
      reps: String(e.reps ?? '').trim().slice(0, 20) || '8-12',
      position: i,
    }))
    .filter((e) => e.name);

  const day = await prisma.planDay.upsert({
    where: { weekday },
    create: { weekday, name, exercises: { create: exercises } },
    update: {
      name,
      // Clear and recreate — see the note above.
      exercises: { deleteMany: {}, create: exercises },
    },
    include: { exercises: { orderBy: { position: 'asc' } } },
  });

  return NextResponse.json(day);
}
