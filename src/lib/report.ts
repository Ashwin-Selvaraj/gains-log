import { prisma } from '@/lib/prisma';
import { HABITS } from '@/lib/goals';
import { getSettings } from '@/lib/settings';
import { addDays, dateRange, type DateKey } from '@/lib/date';
import { withJoins } from '@/lib/db-strategy';

export type WeeklyReport = {
  window: { from: DateKey; to: DateKey };
  weight: {
    avg7: number | null;
    avgPrev7: number | null;
    change: number | null;
    latest: number | null;
    goal: number;
    start: number;
    remaining: number | null;
    /** 0–1 progress from starting weight to goal. */
    progress: number | null;
  };
  habits: { key: string; label: string; days: number; pct: number }[];
  sleep: { avgHours: number | null; nightsLogged: number };
  meetings: { total: number };
  nutrition: {
    avgCalories: number | null;
    avgProtein: number | null;
    daysWithMeals: number;
    proteinTarget: number;
    calorieTarget: [number, number];
  };
  trend: { date: DateKey; weightKg: number | null }[];
  workouts: {
    sessions: number;
    sessionGoal: number;
    totalSets: number;
    /** Sum of reps x weight across every set logged in the last 7 days. */
    volumeKg: number;
    prevVolumeKg: number;
    exercises: {
      name: string;
      sets: number;
      topWeightKg: number | null;
      prevTopWeightKg: number | null;
      /** Heaviest set this week minus heaviest last week. */
      deltaKg: number | null;
    }[];
  };
};

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

const round = (n: number | null, places = 1) =>
  n === null ? null : Math.round(n * 10 ** places) / 10 ** places;

/** Builds the weekly report from the 14-day comparison window plus a 28-day trend. */
export async function buildWeeklyReport(today: DateKey): Promise<WeeklyReport> {
  const trendDays = dateRange(today, 28);
  const from = trendDays[0];

  const [entries, settings] = await Promise.all([
    prisma.dailyEntry.findMany({
      where: { date: { gte: from, lte: today } },
      include: { meetings: true, meals: true, sets: true },
      orderBy: { date: 'asc' },
      ...withJoins,
    }),
    getSettings(),
  ]);

  const byDate = new Map(entries.map((e) => [e.date, e]));
  const last7 = dateRange(today, 7);
  const prev7 = dateRange(addDays(today, -7), 7);

  const weightsIn = (days: DateKey[]) =>
    days
      .map((d) => byDate.get(d)?.weightKg)
      .filter((w): w is number => typeof w === 'number');

  const avg7 = mean(weightsIn(last7));
  const avgPrev7 = mean(weightsIn(prev7));

  const allWeights = entries
    .filter((e) => typeof e.weightKg === 'number')
    .map((e) => e.weightKg as number);
  const latest = allWeights.length ? allWeights[allWeights.length - 1] : null;
  const reference = latest ?? avg7;

  const habits = HABITS.map(({ key, label }) => {
    const days = last7.filter((d) => byDate.get(d)?.[key] === true).length;
    return { key, label, days, pct: Math.round((days / 7) * 100) };
  });

  const sleepValues = last7
    .map((d) => byDate.get(d)?.sleepHours)
    .filter((h): h is number => typeof h === 'number');

  const meetingsTotal = last7.reduce(
    (sum, d) => sum + (byDate.get(d)?.meetings.length ?? 0),
    0,
  );

  // Only days that actually have meals count toward the averages — dividing by
  // 7 when four days were never logged makes the numbers meaningless.
  const mealDays = last7
    .map((d) => byDate.get(d))
    .filter((e) => e && e.meals.length > 0);

  const dayCalories = mealDays.map((e) =>
    e!.meals.reduce((sum, m) => sum + (m.calories ?? 0), 0),
  );
  const dayProtein = mealDays.map((e) =>
    e!.meals.reduce((sum, m) => sum + (m.protein ?? 0), 0),
  );

  // --- training ---------------------------------------------------------
  const setsIn = (days: DateKey[]) =>
    days.flatMap((d) => byDate.get(d)?.sets ?? []);

  const weekSets = setsIn(last7);
  const prevSets = setsIn(prev7);

  const volume = (sets: typeof weekSets) =>
    Math.round(sets.reduce((sum, s) => sum + s.reps * (s.weightKg ?? 0), 0));

  const topWeight = (sets: typeof weekSets, exercise: string) => {
    const weights = sets
      .filter((s) => s.exercise === exercise && typeof s.weightKg === 'number')
      .map((s) => s.weightKg as number);
    return weights.length ? Math.max(...weights) : null;
  };

  // A "session" is a day with at least one set, not a ticked checkbox.
  const sessions = last7.filter((d) => (byDate.get(d)?.sets.length ?? 0) > 0).length;

  const exerciseNames = [...new Set(weekSets.map((s) => s.exercise))];
  const exercises = exerciseNames
    .map((name) => {
      const cur = topWeight(weekSets, name);
      const prev = topWeight(prevSets, name);
      return {
        name,
        sets: weekSets.filter((s) => s.exercise === name).length,
        topWeightKg: cur,
        prevTopWeightKg: prev,
        deltaKg: cur !== null && prev !== null ? round(cur - prev) : null,
      };
    })
    .sort((a, b) => b.sets - a.sets);

  return {
    window: { from: last7[0], to: today },
    weight: {
      avg7: round(avg7),
      avgPrev7: round(avgPrev7),
      change: avg7 !== null && avgPrev7 !== null ? round(avg7 - avgPrev7) : null,
      latest: round(latest),
      goal: settings.goalWeightKg,
      start: settings.startWeightKg,
      remaining: reference !== null ? round(settings.goalWeightKg - reference) : null,
      progress:
        reference !== null
          ? Math.max(
              0,
              Math.min(
                1,
                (reference - settings.startWeightKg) /
                  (settings.goalWeightKg - settings.startWeightKg),
              ),
            )
          : null,
    },
    habits,
    sleep: { avgHours: round(mean(sleepValues)), nightsLogged: sleepValues.length },
    meetings: { total: meetingsTotal },
    nutrition: {
      avgCalories: round(mean(dayCalories), 0),
      avgProtein: round(mean(dayProtein), 0),
      daysWithMeals: mealDays.length,
      proteinTarget: settings.proteinTarget,
      calorieTarget: [settings.caloriesMin, settings.caloriesMax],
    },
    trend: trendDays.map((d) => ({ date: d, weightKg: byDate.get(d)?.weightKg ?? null })),
    workouts: {
      sessions,
      sessionGoal: settings.weeklyWorkoutGoal,
      totalSets: weekSets.length,
      volumeKg: volume(weekSets),
      prevVolumeKg: volume(prevSets),
      exercises,
    },
  };
}
