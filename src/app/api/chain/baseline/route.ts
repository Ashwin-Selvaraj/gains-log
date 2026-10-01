import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';
import { evaluateGoal } from '@/lib/chain/evaluate';
import { toDateKey } from '@/lib/date';

export const dynamic = 'force-dynamic';

const WINDOW_DAYS = 28;

/**
 * What this person actually did over the last four weeks, per pledge metric.
 *
 * Exists so the pledge form can suggest a target instead of asking for a
 * number out of thin air. A stake is only motivating if the goal is a stretch
 * you can hit: set it from a blank box and people either pick something they'd
 * do anyway, or something they'll never reach and lose on. Anchoring on the
 * user's own baseline is what makes the default a sensible bet.
 *
 * Computed with the same evaluateGoal() the verifier uses, so "you did 11
 * sessions" here means exactly what the verifier will count later.
 */
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const deadline = new Date();
  const startsAt = new Date(deadline.getTime() - (WINDOW_DAYS - 1) * 86_400_000);
  const base = { userId: user.id, exerciseKey: null, target: 1, startsAt, deadline };

  const [sessions, proteinDays, sets] = await Promise.all([
    evaluateGoal({ ...base, metric: 'sessions' }),
    evaluateGoal({ ...base, metric: 'protein_days' }),
    prisma.workoutSet.findMany({
      where: {
        userId: user.id,
        exerciseKey: { not: '' },
        weightKg: { gt: 0 },
        entry: { date: { gte: toDateKey(startsAt), lte: toDateKey(deadline) } },
      },
      select: { exercise: true, exerciseKey: true, reps: true, weightKg: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Top lifts by volume — the ones a volume pledge would realistically be about.
  const lifts = new Map<string, { key: string; name: string; volume: number }>();
  for (const s of sets) {
    const lift = lifts.get(s.exerciseKey) ?? { key: s.exerciseKey, name: s.exercise, volume: 0 };
    lift.volume += s.reps * (s.weightKg ?? 0);
    lifts.set(s.exerciseKey, lift);
  }
  const topLifts = [...lifts.values()]
    .map((l) => ({ ...l, volume: Math.round(l.volume) }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 6);

  return NextResponse.json({
    windowDays: WINDOW_DAYS,
    sessions: sessions.actual,
    proteinDays: proteinDays.actual,
    lifts: topLifts,
  });
}
