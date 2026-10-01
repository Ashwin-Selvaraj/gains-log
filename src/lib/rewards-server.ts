import 'server-only';
import { prisma } from '@/lib/prisma';
import { daysBetween, isDateKey, toDateKey, type DateKey } from '@/lib/date';
import { computeStreaks, isLogged, type DayLike } from '@/lib/profile';
import { CHAIN_ID } from '@/lib/chain/config';
import { goalManagerAbi } from '@/lib/chain/abis';
import { publicClient, goalManagerAddress } from '@/lib/chain/server';
import type { Snapshot } from '@/lib/rewards';

/**
 * The client's "today", but only if it's plausible.
 *
 * Dates are local to the person (see lib/date), so the server has to take the
 * phone's word for what day it is — within a day either side of its own clock,
 * which covers every timezone. Anything further out is a wound-forward clock
 * trying to claim tomorrow's daily early, and gets the server's date instead.
 */
export function trustedToday(param: string | null): DateKey {
  const server = toDateKey(new Date());
  if (param && isDateKey(param) && Math.abs(daysBetween(server, param)) <= 1) return param;
  return server;
}

/** Everything the quest rules read, for one person, as of `today`. */
export async function buildSnapshot(userId: string, today: DateKey): Promise<Snapshot> {
  const [rows, settings, sets, goals] = await Promise.all([
    prisma.dailyEntry.findMany({
      // Nothing after today: a back-dated future entry can't pre-fill a streak.
      where: { userId, date: { lte: today } },
      select: {
        date: true,
        workoutDone: true,
        learningDone: true,
        sleptWell: true,
        waterDone: true,
        waterLitres: true,
        weightKg: true,
        sleepHours: true,
        meals: { select: { slot: true, protein: true, photoUrl: true } },
        _count: { select: { sets: true } },
      },
    }),
    prisma.settings.findUnique({ where: { userId }, select: { proteinTarget: true } }),
    prisma.workoutSet.findMany({
      where: { userId, weightKg: { gt: 0 } },
      select: { reps: true, weightKg: true },
    }),
    prisma.stakedGoal.findMany({ where: { userId, chainId: CHAIN_ID }, select: { goalId: true } }),
  ]);

  const dayLikes: DayLike[] = rows.map((r) => ({
    date: r.date,
    workoutDone: r.workoutDone,
    learningDone: r.learningDone,
    sleptWell: r.sleptWell,
    waterDone: r.waterDone,
    waterLitres: r.waterLitres,
    weightKg: r.weightKg,
    sleepHours: r.sleepHours,
    mealCount: r.meals.length,
    setCount: r._count.sets,
  }));

  // A pledge counts as won only if the chain says so — the database row
  // records what was staked on, not how it ended.
  const statuses = await Promise.all(
    goals.map((g) =>
      publicClient
        .readContract({
          address: goalManagerAddress,
          abi: goalManagerAbi,
          functionName: 'getGoal',
          args: [BigInt(g.goalId)],
        })
        .then((goal) => goal.status)
        .catch(() => 0),
    ),
  );

  return {
    today,
    days: rows.map((r, i) => ({
      date: r.date,
      logged: isLogged(dayLikes[i]),
      trained: r.workoutDone || r._count.sets > 0,
      mealSlots: [...new Set(r.meals.map((m) => m.slot))],
      protein: r.meals.reduce((sum, m) => sum + (m.protein ?? 0), 0),
      photoMeals: r.meals.filter((m) => m.photoUrl).length,
      waterDone: r.waterDone,
    })),
    proteinTarget: settings?.proteinTarget ?? 0,
    lifetimeVolumeKg: sets.reduce((sum, s) => sum + s.reps * (s.weightKg ?? 0), 0),
    pledgesWon: statuses.filter((s) => s === 2).length,
    streak: (({ current, longest }) => ({ current, longest }))(computeStreaks(dayLikes, today)),
  };
}

/** First of the month this date falls in, as a Date at local midnight. */
export function monthStart(today: DateKey): Date {
  const [y, m] = today.split('-').map(Number);
  return new Date(y, m - 1, 1);
}
