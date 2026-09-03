import { prisma } from '@/lib/prisma';
import { HABITS } from '@/lib/goals';
import { readSettings } from '@/lib/settings';
import { loadSets } from '@/lib/workouts';
import { markPRs, type PRKind } from '@/lib/prs';
import { planProgress, isRestDay } from '@/lib/plan';
import { addDays, dateRange, type DateKey } from '@/lib/date';
import { withJoins } from '@/lib/db-strategy';

/**
 * The weekly report.
 *
 * Deliberately opinionated rather than a wall of numbers: it states a verdict,
 * says what slipped, and says what to do about it. A figure like "112 g protein"
 * is only useful next to "28 g short, five days out of seven — that's one shake
 * a day", which is what the insights below produce.
 */

const round1 = (n: number | null) =>
  n === null ? null : Math.round(n * 10) / 10;
const round0 = (n: number | null) => (n === null ? null : Math.round(n));

export type Insight = {
  /** Ordering and colour: wins first read as encouragement, misses as work. */
  tone: 'win' | 'watch' | 'miss';
  title: string;
  detail: string;
  /** Concrete next action, where one can honestly be named. */
  action?: string;
};

export type ScorePart = {
  label: string;
  score: number;
  max: number;
  detail: string;
};

export type DaySnapshot = {
  date: DateKey;
  workoutDone: boolean;
  learningDone: boolean;
  sleptWell: boolean;
  waterDone: boolean;
  kcal: number;
  protein: number;
  sets: number;
  weightKg: number | null;
  sleepHours: number | null;
  /** Nothing logged at all — distinct from "logged, all zero". */
  empty: boolean;
};

export type WeeklyReport = {
  window: { from: DateKey; to: DateKey };

  score: {
    total: number;
    /** Plain-language summary of the week as a whole. */
    verdict: string;
    parts: ScorePart[];
  };

  weight: {
    avg7: number | null;
    avgPrev7: number | null;
    change: number | null;
    latest: number | null;
    goal: number;
    start: number;
    remaining: number | null;
    progress: number | null;
    /** kg per week, fitted across the trend window. Null without enough points. */
    ratePerWeek: number | null;
    /** Weeks to the goal at the current rate; null if not gaining. */
    weeksToGoal: number | null;
    projectedDate: string | null;
  };

  training: {
    sessions: number;
    sessionGoal: number;
    totalSets: number;
    volumeKg: number;
    prevVolumeKg: number;
    /** Planned exercises completed, across the whole week. */
    adherence: { planned: number; completed: number; pct: number };
    missedSessions: { date: DateKey; name: string; missed: string[] }[];
    exercises: {
      name: string;
      key: string;
      sets: number;
      topWeightKg: number | null;
      prevTopWeightKg: number | null;
      deltaKg: number | null;
    }[];
    prs: {
      exercise: string;
      key: string;
      date: DateKey;
      reps: number;
      weightKg: number | null;
      kinds: PRKind[];
    }[];
  };

  nutrition: {
    avgCalories: number | null;
    avgProtein: number | null;
    avgCarbs: number | null;
    avgFat: number | null;
    avgFiber: number | null;
    daysWithMeals: number;
    proteinHitDays: number;
    calorieHitDays: number;
    proteinTarget: number;
    calorieTarget: [number, number];
    bestProteinDay: { date: DateKey; protein: number } | null;
  };

  habits: {
    key: string;
    label: string;
    days: number;
    pct: number;
    /** Consecutive days up to today. */
    streak: number;
  }[];

  sleep: { avgHours: number | null; nightsLogged: number; goodNights: number };
  water: { avgLitres: number | null; daysLogged: number };
  meetings: { total: number };

  insights: Insight[];
  days: DaySnapshot[];
  trend: { date: DateKey; weightKg: number | null }[];
};

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * Least-squares slope of weight against day index, converted to kg/week.
 * A regression rather than (this week − last week): bodyweight swings a kilo
 * on water alone, so a two-point difference is mostly noise, while a fit across
 * the whole window is the actual trend.
 */
function weeklyRate(points: { date: DateKey; weightKg: number | null }[]): number | null {
  const xs: number[] = [];
  const ys: number[] = [];
  points.forEach((p, i) => {
    if (p.weightKg !== null) {
      xs.push(i);
      ys.push(p.weightKg);
    }
  });
  if (xs.length < 4) return null;

  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;
  return (num / den) * 7; // slope is per day; report per week
}

export async function buildWeeklyReport(
  userId: string,
  today: DateKey,
): Promise<WeeklyReport> {
  const trendDays = dateRange(today, 28);
  const from = trendDays[0];
  const last7 = dateRange(today, 7);
  const prev7 = dateRange(addDays(today, -7), 7);

  const [entries, settings, allSets, planDays] = await Promise.all([
    prisma.dailyEntry.findMany({
      where: { userId, date: { gte: from, lte: today } },
      include: { meetings: true, meals: true, sets: true },
      orderBy: { date: 'asc' },
      ...withJoins,
    }),
    readSettings(userId),
    // Every set ever: a PR is only a PR against all history, which the 28-day
    // window above cannot tell you.
    loadSets(userId),
    prisma.planDay.findMany({
      where: { userId },
      include: { exercises: { orderBy: { position: 'asc' } } },
      ...withJoins,
    }),
  ]);

  const byDate = new Map(entries.map((e) => [e.date, e]));
  const planByWeekday = new Map(planDays.map((d) => [d.weekday, d]));

  /* ── weight ─────────────────────────────────────────────────────────── */

  const weightsIn = (days: DateKey[]) =>
    days
      .map((d) => byDate.get(d)?.weightKg)
      .filter((w): w is number => typeof w === 'number');

  const avg7 = mean(weightsIn(last7));
  const avgPrev7 = mean(weightsIn(prev7));
  const trend = trendDays.map((d) => ({
    date: d,
    weightKg: byDate.get(d)?.weightKg ?? null,
  }));

  const allWeights = entries
    .filter((e) => typeof e.weightKg === 'number')
    .map((e) => e.weightKg as number);
  const latest = allWeights.length ? allWeights[allWeights.length - 1] : null;
  const reference = latest ?? avg7;

  const rate = weeklyRate(trend);
  const remaining = reference !== null ? settings.goalWeightKg - reference : null;
  const weeksToGoal =
    rate !== null && rate > 0.02 && remaining !== null && remaining > 0
      ? Math.ceil(remaining / rate)
      : null;

  /* ── training ───────────────────────────────────────────────────────── */

  const setsIn = (days: DateKey[]) => days.flatMap((d) => byDate.get(d)?.sets ?? []);
  const weekSets = setsIn(last7);
  const prevSets = setsIn(prev7);

  const volume = (sets: typeof weekSets) =>
    Math.round(sets.reduce((sum, s) => sum + s.reps * (s.weightKg ?? 0), 0));

  const topWeight = (sets: typeof weekSets, key: string) => {
    const weights = sets
      .filter((s) => s.exerciseKey === key && typeof s.weightKg === 'number')
      .map((s) => s.weightKg as number);
    return weights.length ? Math.max(...weights) : null;
  };

  const sessions = last7.filter((d) => (byDate.get(d)?.sets.length ?? 0) > 0).length;

  const exerciseKeys = [...new Set(weekSets.map((s) => s.exerciseKey))];
  const exercises = exerciseKeys
    .map((key) => {
      const mine = weekSets.filter((s) => s.exerciseKey === key);
      const cur = topWeight(weekSets, key);
      const prev = topWeight(prevSets, key);
      return {
        name: mine[mine.length - 1]?.exercise ?? key,
        key,
        sets: mine.length,
        topWeightKg: cur,
        prevTopWeightKg: prev,
        deltaKg: cur !== null && prev !== null ? round1(cur - prev) : null,
      };
    })
    .sort((a, b) => b.sets - a.sets);

  // Plan adherence across the week, using the same completion rule the Today
  // card uses — a report that disagrees with the screen it summarises is worse
  // than no report.
  let plannedTotal = 0;
  let completedTotal = 0;
  const missedSessions: { date: DateKey; name: string; missed: string[] }[] = [];

  for (const d of last7) {
    const weekday = new Date(`${d}T00:00:00`).getDay();
    const plan = planByWeekday.get(weekday);
    if (!plan || isRestDay(plan.name) || plan.exercises.length === 0) continue;

    const logged = (byDate.get(d)?.sets ?? []).map((s) => ({
      exercise: s.exercise,
      reps: s.reps,
      weightKg: s.weightKg,
    }));
    const progress = planProgress(
      plan.name,
      plan.exercises.map((e) => ({
        name: e.name,
        exerciseKey: e.exerciseKey,
        sets: e.sets,
        reps: e.reps,
      })),
      logged,
    );

    plannedTotal += progress.totalCount;
    completedTotal += progress.doneCount;
    if (progress.missed.length > 0) {
      missedSessions.push({
        date: d,
        name: plan.name,
        missed: progress.missed.map((m) => m.name),
      });
    }
  }

  const prMarks = markPRs(allSets);
  const weekPRs = allSets
    .filter((s) => last7.includes(s.date) && prMarks.has(s.id))
    .map((s) => ({
      exercise: s.exercise,
      key: s.exerciseKey,
      date: s.date,
      reps: s.reps,
      weightKg: s.weightKg,
      kinds: prMarks.get(s.id)!,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  /* ── nutrition ──────────────────────────────────────────────────────── */

  const mealDays = last7
    .map((d) => byDate.get(d))
    .filter((e): e is NonNullable<typeof e> => Boolean(e && e.meals.length > 0));

  const dayTotal = (e: (typeof mealDays)[number], field: 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber') =>
    e.meals.reduce((sum, m) => sum + ((m[field] as number | null) ?? 0), 0);

  const dayCalories = mealDays.map((e) => dayTotal(e, 'calories'));
  const dayProtein = mealDays.map((e) => dayTotal(e, 'protein'));

  const proteinHitDays = dayProtein.filter((p) => p >= settings.proteinTarget).length;
  const calorieHitDays = dayCalories.filter(
    (c) => c >= settings.caloriesMin && c <= settings.caloriesMax,
  ).length;

  const bestProteinDay =
    mealDays.length > 0
      ? mealDays
          .map((e) => ({ date: e.date, protein: Math.round(dayTotal(e, 'protein')) }))
          .reduce((a, b) => (b.protein > a.protein ? b : a))
      : null;

  /* ── habits ─────────────────────────────────────────────────────────── */

  const habits = HABITS.map(({ key, label }) => {
    const days = last7.filter((d) => byDate.get(d)?.[key] === true).length;
    // Consecutive days ending today — a streak you can break, unlike a
    // percentage, which is what makes it worth protecting.
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const probe = addDays(today, -i);
      if (byDate.get(probe)?.[key] === true) streak++;
      else break;
    }
    return { key, label, days, pct: Math.round((days / 7) * 100), streak };
  });

  const sleepValues = last7
    .map((d) => byDate.get(d)?.sleepHours)
    .filter((h): h is number => typeof h === 'number');

  const waterValues = last7
    .map((d) => byDate.get(d)?.waterLitres)
    .filter((w): w is number => typeof w === 'number');

  /* ── score ──────────────────────────────────────────────────────────── */

  const habitTicks = habits.reduce((n, h) => n + h.days, 0);
  const trainingScore = Math.min(sessions / Math.max(settings.weeklyWorkoutGoal, 1), 1) * 30;
  const habitScore = (habitTicks / (HABITS.length * 7)) * 25;
  const proteinScore = (proteinHitDays / 7) * 25;
  const adherenceScore =
    plannedTotal > 0 ? (completedTotal / plannedTotal) * 20 : sessions > 0 ? 20 : 0;

  const parts: ScorePart[] = [
    {
      label: 'Training',
      score: Math.round(trainingScore),
      max: 30,
      detail: `${sessions} of ${settings.weeklyWorkoutGoal} sessions`,
    },
    {
      label: 'Habits',
      score: Math.round(habitScore),
      max: 25,
      detail: `${habitTicks} of ${HABITS.length * 7} ticks`,
    },
    {
      label: 'Protein',
      score: Math.round(proteinScore),
      max: 25,
      detail: `${proteinHitDays} of 7 days on target`,
    },
    {
      label: 'Plan followed',
      score: Math.round(adherenceScore),
      max: 20,
      detail:
        plannedTotal > 0
          ? `${completedTotal} of ${plannedTotal} exercises`
          : 'no plan set',
    },
  ];

  const total = parts.reduce((n, p) => n + p.score, 0);
  const verdict =
    total >= 85
      ? 'Excellent week — everything moving together.'
      : total >= 70
        ? 'Solid week. One or two things to tighten.'
        : total >= 50
          ? 'Mixed week — the basics held, the details slipped.'
          : total >= 25
            ? 'Off the pace this week. Pick one thing to fix.'
            : 'Barely logged. The tracker only works if the days go in.';

  /* ── insights ───────────────────────────────────────────────────────── */

  const insights: Insight[] = [];

  if (weekPRs.length > 0) {
    insights.push({
      tone: 'win',
      title: `${weekPRs.length} personal record${weekPRs.length === 1 ? '' : 's'}`,
      detail: weekPRs
        .slice(0, 3)
        .map((p) => `${p.exercise} ${p.weightKg ? `${p.weightKg}kg × ${p.reps}` : `${p.reps} reps`}`)
        .join(', '),
    });
  }

  const bestStreak = [...habits].sort((a, b) => b.streak - a.streak)[0];
  if (bestStreak && bestStreak.streak >= 3) {
    insights.push({
      tone: 'win',
      title: `${bestStreak.streak}-day ${bestStreak.label.toLowerCase()} streak`,
      detail: 'Keep it alive — streaks are the cheapest motivation there is.',
    });
  }

  const avgProtein = mean(dayProtein);
  if (avgProtein !== null && avgProtein < settings.proteinTarget) {
    const gap = Math.round(settings.proteinTarget - avgProtein);
    insights.push({
      tone: gap > 30 ? 'miss' : 'watch',
      title: `Protein ${gap} g/day short`,
      detail: `Averaged ${Math.round(avgProtein)} g against a ${settings.proteinTarget} g target, hitting it on ${proteinHitDays} of 7 days.`,
      action:
        gap >= 25
          ? 'A whey shake and 2 eggs would close most of this.'
          : 'One extra serving of curd or a shake covers it.',
    });
  }

  const avgCalories = mean(dayCalories);
  if (avgCalories !== null && avgCalories < settings.caloriesMin) {
    const gap = Math.round(settings.caloriesMin - avgCalories);
    insights.push({
      tone: 'miss',
      title: `Eating ${gap} kcal/day under the floor`,
      detail: `You cannot gain on ${Math.round(avgCalories)} kcal when the target starts at ${settings.caloriesMin}.`,
      action: 'Add a bigger breakfast or a second dinner portion.',
    });
  }

  if (mealDays.length < 5) {
    insights.push({
      tone: mealDays.length <= 2 ? 'miss' : 'watch',
      title: `Meals logged on only ${mealDays.length} of 7 days`,
      detail: 'The nutrition figures only cover the days that were logged, so they flatter you.',
      action: 'Log the presets — they are one tap each.',
    });
  }

  if (sessions < settings.weeklyWorkoutGoal) {
    insights.push({
      tone: settings.weeklyWorkoutGoal - sessions >= 2 ? 'miss' : 'watch',
      title: `${sessions} of ${settings.weeklyWorkoutGoal} sessions trained`,
      detail:
        missedSessions.length > 0
          ? `Missed: ${missedSessions.map((m) => m.name).join(', ')}.`
          : 'No sets logged on the missing days.',
      action: missedSessions.length > 0 ? 'Carry the missed work forward from Today.' : undefined,
    });
  }

  const avgSleep = mean(sleepValues);
  if (avgSleep !== null && avgSleep < 7) {
    insights.push({
      tone: avgSleep < 6 ? 'miss' : 'watch',
      title: `Sleeping ${round1(avgSleep)} h a night`,
      detail: 'Muscle is built asleep. Under 7 h blunts recovery and appetite alike.',
    });
  }

  if (rate !== null && reference !== null) {
    if (rate <= 0.01) {
      insights.push({
        tone: 'miss',
        title: 'Weight is flat or falling',
        detail: `Trending ${round1(rate)} kg/week over the last four weeks — a bulk needs a surplus.`,
        action: 'Raise daily calories by roughly 200–300 and re-check next week.',
      });
    } else if (rate > 0.6) {
      insights.push({
        tone: 'watch',
        title: `Gaining fast at ${round1(rate)} kg/week`,
        detail: 'Above roughly 0.5 kg/week, more of the gain tends to be fat than muscle.',
      });
    }
  }

  if (avgProtein !== null && avgProtein >= settings.proteinTarget) {
    insights.push({
      tone: 'win',
      title: 'Protein target met on average',
      detail: `${Math.round(avgProtein)} g/day against a ${settings.proteinTarget} g target.`,
    });
  }

  const order = { win: 0, miss: 1, watch: 2 } as const;
  insights.sort((a, b) => order[a.tone] - order[b.tone]);

  /* ── per-day grid ───────────────────────────────────────────────────── */

  const days: DaySnapshot[] = last7.map((date) => {
    const e = byDate.get(date);
    return {
      date,
      workoutDone: e?.workoutDone ?? false,
      learningDone: e?.learningDone ?? false,
      sleptWell: e?.sleptWell ?? false,
      waterDone: e?.waterDone ?? false,
      kcal: Math.round(e?.meals.reduce((s, m) => s + (m.calories ?? 0), 0) ?? 0),
      protein: Math.round(e?.meals.reduce((s, m) => s + (m.protein ?? 0), 0) ?? 0),
      sets: e?.sets.length ?? 0,
      weightKg: e?.weightKg ?? null,
      sleepHours: e?.sleepHours ?? null,
      empty: !e,
    };
  });

  return {
    window: { from: last7[0], to: today },

    score: { total, verdict, parts },

    weight: {
      avg7: round1(avg7),
      avgPrev7: round1(avgPrev7),
      change: avg7 !== null && avgPrev7 !== null ? round1(avg7 - avgPrev7) : null,
      latest: round1(latest),
      goal: settings.goalWeightKg,
      start: settings.startWeightKg,
      remaining: round1(remaining),
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
      ratePerWeek: round1(rate),
      weeksToGoal,
      projectedDate:
        weeksToGoal !== null
          ? new Date(
              new Date(`${today}T00:00:00`).getTime() + weeksToGoal * 7 * 86_400_000,
            ).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
          : null,
    },

    training: {
      sessions,
      sessionGoal: settings.weeklyWorkoutGoal,
      totalSets: weekSets.length,
      volumeKg: volume(weekSets),
      prevVolumeKg: volume(prevSets),
      adherence: {
        planned: plannedTotal,
        completed: completedTotal,
        pct: plannedTotal > 0 ? Math.round((completedTotal / plannedTotal) * 100) : 0,
      },
      missedSessions,
      exercises,
      prs: weekPRs,
    },

    nutrition: {
      avgCalories: round0(mean(dayCalories)),
      avgProtein: round0(avgProtein),
      avgCarbs: round0(mean(mealDays.map((e) => dayTotal(e, 'carbs')))),
      avgFat: round0(mean(mealDays.map((e) => dayTotal(e, 'fat')))),
      avgFiber: round0(mean(mealDays.map((e) => dayTotal(e, 'fiber')))),
      daysWithMeals: mealDays.length,
      proteinHitDays,
      calorieHitDays,
      proteinTarget: settings.proteinTarget,
      calorieTarget: [settings.caloriesMin, settings.caloriesMax],
      bestProteinDay,
    },

    habits,
    sleep: {
      avgHours: round1(mean(sleepValues)),
      nightsLogged: sleepValues.length,
      goodNights: last7.filter((d) => byDate.get(d)?.sleptWell === true).length,
    },
    water: { avgLitres: round1(mean(waterValues)), daysLogged: waterValues.length },
    meetings: {
      total: last7.reduce((sum, d) => sum + (byDate.get(d)?.meetings.length ?? 0), 0),
    },

    insights,
    days,
    trend,
  };
}
