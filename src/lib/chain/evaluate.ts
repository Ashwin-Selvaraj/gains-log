import 'server-only';
import { prisma } from '@/lib/prisma';
import { toDateKey } from '@/lib/date';
import { METRICS, METRIC_KEYS, type MetricKey } from '@/lib/chain/metrics';

// Re-exported so server callers have one import, while the client imports the
// pure module directly and never reaches this file.
export { METRICS, METRIC_KEYS };
export type { MetricKey };

/**
 * Decides whether a staked goal was actually met, from the logs.
 *
 * This is the whole reason the verifier role is held by the server rather than
 * by a person: a human verifier on their own goals is just a button that says
 * "yes". Here the answer comes from the same rows the app has been writing all
 * along, and the verifier's only job is to report it honestly.
 *
 * Deliberately pure of chain concerns — it reads Postgres and returns a verdict.
 * Whether that verdict is then written on-chain is the caller's business, which
 * keeps the question "did I do the work" testable without a blockchain.
 */

export type Verdict = {
  met: boolean;
  actual: number;
  target: number;
  /** Said in the app's own words, so a refusal explains itself. */
  detail: string;
};

export async function evaluateGoal(goal: {
  userId: string;
  metric: string;
  exerciseKey: string | null;
  target: number;
  startsAt: Date;
  deadline: Date;
}): Promise<Verdict> {
  const from = toDateKey(goal.startsAt);
  const to = toDateKey(goal.deadline);

  switch (goal.metric) {
    case 'volume': {
      const sets = await prisma.workoutSet.findMany({
        where: {
          userId: goal.userId,
          ...(goal.exerciseKey ? { exerciseKey: goal.exerciseKey } : {}),
          entry: { date: { gte: from, lte: to } },
        },
        select: { reps: true, weightKg: true },
      });
      // Bodyweight sets carry no load, so they contribute no volume. Counting
      // them as reps would quietly let a pull-up goal be met by a bench goal.
      const actual = Math.round(
        sets.reduce((sum, s) => sum + s.reps * (s.weightKg ?? 0), 0),
      );
      return {
        met: actual >= goal.target,
        actual,
        target: goal.target,
        detail: `${actual} kg of ${goal.exerciseKey ?? 'all lifts'} between ${from} and ${to}`,
      };
    }

    case 'sessions': {
      const entries = await prisma.dailyEntry.findMany({
        where: {
          userId: goal.userId,
          date: { gte: from, lte: to },
          sets: { some: {} },
        },
        select: { date: true },
      });
      return {
        met: entries.length >= goal.target,
        actual: entries.length,
        target: goal.target,
        detail: `${entries.length} days with a logged set between ${from} and ${to}`,
      };
    }

    case 'protein_days': {
      const [settings, days] = await Promise.all([
        prisma.settings.findUnique({
          where: { userId: goal.userId },
          select: { proteinTarget: true },
        }),
        prisma.dailyEntry.findMany({
          where: { userId: goal.userId, date: { gte: from, lte: to } },
          select: { date: true, meals: { select: { protein: true } } },
        }),
      ]);
      const proteinTarget = settings?.proteinTarget ?? 0;
      const hit = days.filter(
        (d) => d.meals.reduce((sum, m) => sum + (m.protein ?? 0), 0) >= proteinTarget,
      ).length;
      return {
        met: hit >= goal.target,
        actual: hit,
        target: goal.target,
        detail: `${hit} days at or above ${proteinTarget} g protein between ${from} and ${to}`,
      };
    }

    default:
      // An unknown metric must never read as success. A goal whose definition
      // this version does not understand is one it cannot honestly approve.
      return {
        met: false,
        actual: 0,
        target: goal.target,
        detail: `Unknown metric "${goal.metric}" — this build cannot evaluate it.`,
      };
  }
}
