import { prisma } from '@/lib/prisma';
import { readSettings } from '@/lib/settings';
import { calendarConnected } from '@/lib/calendar';
import { loadSets } from '@/lib/workouts';
import { recordsByExercise } from '@/lib/prs';
import { addDays, type DateKey } from '@/lib/date';
import {
  buildBodyStats,
  computeStreaks,
  tallyHabits,
  type DayLike,
} from '@/lib/profile';

/**
 * Everything the profile screen shows, in one request.
 *
 * The alternative was letting the page call /api/report, /api/exercises and
 * /api/settings and stitch them together, which is three round trips to a
 * database in Singapore for one screen. The queries here run concurrently and
 * the arithmetic is done by the pure functions in src/lib/profile.ts.
 */

/** How far back the consistency figures look. A quarter reads as "lately". */
const WINDOW_DAYS = 90;

export async function buildProfile(userId: string, today: DateKey) {
  const since = addDays(today, -(WINDOW_DAYS - 1));

  const [user, settings, rows, sets, connected] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, image: true, isAdmin: true, createdAt: true },
    }),
    readSettings(userId),
    prisma.dailyEntry.findMany({
      where: { userId, date: { gte: since, lte: today } },
      orderBy: { date: 'asc' },
      select: {
        date: true,
        workoutDone: true,
        learningDone: true,
        sleptWell: true,
        waterDone: true,
        waterLitres: true,
        weightKg: true,
        sleepHours: true,
        _count: { select: { meals: true, sets: true } },
      },
    }),
    loadSets(userId),
    calendarConnected(userId).catch(() => false),
  ]);

  const days: DayLike[] = rows.map((r) => ({
    date: r.date,
    workoutDone: r.workoutDone,
    learningDone: r.learningDone,
    sleptWell: r.sleptWell,
    waterDone: r.waterDone,
    waterLitres: r.waterLitres,
    weightKg: r.weightKg,
    sleepHours: r.sleepHours,
    mealCount: r._count.meals,
    setCount: r._count.sets,
  }));

  // Latest weigh-in, which is not necessarily today's — weight is logged when
  // you happen to step on the scale, so the most recent reading is the honest
  // "current" figure rather than a blank whenever today has none.
  const weighed = [...days].reverse().find((d) => d.weightKg != null);

  const records = [...recordsByExercise(sets, today).values()];
  const totalVolume = records.reduce((sum, r) => sum + r.totals.volumeKg, 0);

  return {
    user: {
      name: user?.name ?? null,
      email: user?.email ?? '',
      image: user?.image ?? null,
      isAdmin: Boolean(user?.isAdmin),
      memberSince: user?.createdAt?.toISOString().slice(0, 10) ?? null,
    },
    streaks: computeStreaks(days, today),
    body: buildBodyStats({
      currentKg: weighed?.weightKg ?? null,
      startKg: settings.startWeightKg,
      goalKg: settings.goalWeightKg,
      heightCm: settings.heightCm,
    }),
    lastWeighedOn: weighed?.date ?? null,
    habits: tallyHabits(days),
    windowDays: WINDOW_DAYS,
    training: {
      exercises: records.length,
      sessions: new Set(sets.map((s) => s.date)).size,
      totalSets: sets.length,
      totalVolumeKg: Math.round(totalVolume),
      /** Heaviest lifts, for the "what am I proudest of" line. */
      topLifts: records
        .filter((r) => r.heaviest)
        .sort((a, b) => (b.heaviest?.weightKg ?? 0) - (a.heaviest?.weightKg ?? 0))
        .slice(0, 3)
        .map((r) => ({ key: r.key, name: r.name, weightKg: r.heaviest?.weightKg ?? 0 })),
    },
    calendarConnected: connected,
    settings: {
      heightCm: settings.heightCm,
      startWeightKg: settings.startWeightKg,
      goalWeightKg: settings.goalWeightKg,
      timezone: settings.timezone,
    },
  };
}

export type Profile = Awaited<ReturnType<typeof buildProfile>>;
