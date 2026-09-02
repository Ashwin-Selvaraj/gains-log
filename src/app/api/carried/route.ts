import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isDateKey } from '@/lib/date';
import { exerciseKey } from '@/lib/prs';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get('date');
  if (!date || !isDateKey(date)) {
    return NextResponse.json({ error: 'valid date required' }, { status: 400 });
  }
  return NextResponse.json(
    await prisma.carriedExercise.findMany({
      where: { toDate: date },
      orderBy: { createdAt: 'asc' },
    }),
  );
}

/**
 * Moves missed exercises onto a later day.
 *
 * Each carried exercise keeps its own target sets/reps rather than pointing at
 * the plan: editing the weekly split afterwards shouldn't quietly change what
 * you owe yourself from last Tuesday.
 */
export async function POST(req: Request) {
  const body = (await req.json()) as {
    fromDate?: string;
    toDate?: string;
    exercises?: { name?: string; sets?: number; reps?: string }[];
  };

  const fromDate = String(body.fromDate ?? '');
  const toDate = String(body.toDate ?? '');

  if (!isDateKey(fromDate) || !isDateKey(toDate)) {
    return NextResponse.json({ error: 'valid fromDate and toDate required' }, { status: 400 });
  }
  if (toDate <= fromDate) {
    return NextResponse.json(
      { error: 'Carry forward to a later day than the one you missed.' },
      { status: 400 },
    );
  }

  const items = (body.exercises ?? [])
    .map((e) => ({
      name: String(e.name ?? '').trim().slice(0, 100),
      sets: Math.min(Math.max(Math.round(Number(e.sets) || 3), 1), 20),
      reps: String(e.reps ?? '').trim().slice(0, 20) || '8-12',
    }))
    .filter((e) => e.name);

  if (items.length === 0) {
    return NextResponse.json({ error: 'no exercises to carry' }, { status: 400 });
  }

  // Skip anything already carried onto that day, so tapping twice doesn't
  // duplicate the whole session.
  const existing = await prisma.carriedExercise.findMany({
    where: { toDate, exerciseKey: { in: items.map((i) => exerciseKey(i.name)) } },
    select: { exerciseKey: true },
  });
  const already = new Set(existing.map((e) => e.exerciseKey));

  const toCreate = items
    .filter((i) => !already.has(exerciseKey(i.name)))
    .map((i) => ({ ...i, exerciseKey: exerciseKey(i.name), fromDate, toDate }));

  if (toCreate.length) await prisma.carriedExercise.createMany({ data: toCreate });

  // If any of these were themselves carried *onto* the source day, that copy is
  // now stale — it has been moved on, not duplicated. Leaving it would keep the
  // exercise owed on two days at once and count against both.
  // Exercises from the weekly plan have no row here and are untouched; they
  // simply come round again with next week's template.
  await prisma.carriedExercise.deleteMany({
    where: {
      toDate: fromDate,
      exerciseKey: { in: items.map((i) => exerciseKey(i.name)) },
    },
  });

  return NextResponse.json(
    await prisma.carriedExercise.findMany({ where: { toDate }, orderBy: { createdAt: 'asc' } }),
    { status: 201 },
  );
}
