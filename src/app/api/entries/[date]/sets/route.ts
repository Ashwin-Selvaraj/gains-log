import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureEntryId } from '@/lib/entries';
import { isDateKey } from '@/lib/date';
import { exerciseKey } from '@/lib/prs';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ date: string }> };

export async function POST(req: Request, { params }: Params) {
  const { date } = await params;
  if (!isDateKey(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 });

  const body = (await req.json()) as Record<string, unknown>;
  const exercise = String(body.exercise ?? '').trim().slice(0, 100);
  if (!exercise) {
    return NextResponse.json({ error: 'exercise required' }, { status: 400 });
  }

  const reps = Math.round(Number(body.reps));
  if (!Number.isFinite(reps) || reps < 1 || reps > 1000) {
    return NextResponse.json({ error: 'reps must be 1-1000' }, { status: 400 });
  }

  let weightKg: number | null = null;
  if (body.weightKg !== null && body.weightKg !== '' && body.weightKg !== undefined) {
    const w = Number(body.weightKg);
    if (!Number.isFinite(w) || w < 0 || w > 1000) {
      return NextResponse.json({ error: 'weightKg must be 0-1000' }, { status: 400 });
    }
    weightKg = w;
  }

  const entryId = await ensureEntryId(date);

  // Logging a set means you trained. Ticking the stamp separately is busywork.
  const [set] = await Promise.all([
    prisma.workoutSet.create({
      data: { exercise, exerciseKey: exerciseKey(exercise), reps, weightKg, entryId },
    }),
    prisma.dailyEntry.update({ where: { id: entryId }, data: { workoutDone: true } }),
  ]);

  return NextResponse.json(set, { status: 201 });
}
