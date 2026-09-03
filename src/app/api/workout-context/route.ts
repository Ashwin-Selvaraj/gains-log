import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { loadSets, planKeysForWeekday } from '@/lib/workouts';
import { computeRecords, lastSessionBefore } from '@/lib/prs';
import { isDateKey, todayKey } from '@/lib/date';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Everything the Today workout card needs to answer "what did I lift for this
 * last time, and what's my best?" — for every exercise on the day's plan, plus
 * anything already logged today.
 *
 * One request covering all exercises rather than one per exercise: on a phone
 * the per-request latency dominates, so N round trips would be N times slower
 * for the same bytes.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const param = new URL(req.url).searchParams.get('date');
  const date = param && isDateKey(param) ? param : todayKey();

  const weekday = new Date(`${date}T00:00:00`).getDay();

  // The plan and today's sets don't depend on each other, so they go out
  // together — one round trip instead of two, and this endpoint is on the
  // critical path of every gym session.
  const [planned, todaySets, carried, planDay] = await Promise.all([
    planKeysForWeekday(user.id, weekday),
    // Sets logged today tell us about off-plan exercises we also need.
    loadSets(user.id, { since: date }),
    prisma.carriedExercise.findMany({
      where: { userId: user.id, toDate: date },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.planDay.findUnique({
      where: { userId_weekday: { userId: user.id, weekday } },
      select: { name: true },
    }),
  ]);
  const loggedToday = todaySets.filter((s) => s.date === date);

  // Carried exercises count as part of today's session, so they need records
  // and last-session context exactly like planned ones do.
  const keys = [
    ...new Set([
      ...planned.map((p) => p.key),
      ...carried.map((c) => c.exerciseKey),
      ...loggedToday.map((s) => s.exerciseKey),
    ]),
  ].filter(Boolean);

  const carriedOut = carried.map((c) => ({
    id: c.id,
    name: c.name,
    key: c.exerciseKey,
    sets: c.sets,
    reps: c.reps,
    fromDate: c.fromDate,
  }));

  if (keys.length === 0) {
    return NextResponse.json({
      date,
      exercises: [],
      sessionName: planDay?.name ?? null,
      carried: carriedOut,
    });
  }

  const sets = await loadSets(user.id, { keys });

  const exercises = keys.map((key) => {
    const forKey = sets.filter((s) => s.exerciseKey === key);
    const priorToToday = forKey.filter((s) => s.date < date);

    const last = lastSessionBefore(forKey, date);
    // Records as they stood before today, so beating them today reads as new.
    const records = computeRecords(priorToToday, date);

    return {
      key,
      name: planned.find((p) => p.key === key)?.name ?? forKey[0]?.exercise ?? key,
      last: last
        ? {
            date: last.date,
            volumeKg: last.volumeKg,
            sets: last.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg })),
          }
        : null,
      daysSince: records?.daysSinceLast ?? null,
      heaviestKg: records?.heaviest?.weightKg ?? null,
      bestReps: records?.bestReps?.reps ?? null,
      best1RM: records?.best1RM?.est1RM ?? null,
      bodyweight: records?.bodyweight ?? false,
      weeksTrained: records?.weeksTrained ?? 0,
    };
  });

  return NextResponse.json({
    date,
    exercises,
    sessionName: planDay?.name ?? null,
    carried: carriedOut,
  });
}
