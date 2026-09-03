import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withJoins } from '@/lib/db-strategy';
import { exerciseKey } from '@/lib/prs';
import { requireUser, unauthorized } from '@/lib/auth';
import { addDays, isDateKey, todayKey, type DateKey } from '@/lib/date';

export const dynamic = 'force-dynamic';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/**
 * The date this weekday falls on in the current week.
 *
 * The plan is a weekly template with no dates of its own, so "have I done
 * Wednesday's session?" only means something once Wednesday is pinned to an
 * actual date. Weeks run Monday to Sunday, matching the order the Plan screen
 * lays the days out in — weekday 0 is Sunday in JavaScript, which puts it at
 * the end of the week rather than the start.
 */
function dateOfWeekdayThisWeek(today: DateKey, weekday: number): DateKey {
  const todayWeekday = new Date(`${today}T00:00:00`).getDay();
  const fromMonday = (todayWeekday + 6) % 7;
  const monday = addDays(today, -fromMonday);
  return addDays(monday, (weekday + 6) % 7);
}

/**
 * All seven weekdays, filling in any the user hasn't set up — each annotated
 * with what was actually logged against it this week.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  // The client passes its own date so the week is the user's week, not the
  // server's — the same reason every other dated endpoint does.
  const param = new URL(req.url).searchParams.get('today');
  const today = param && isDateKey(param) ? param : todayKey();

  const dates = new Map(WEEKDAYS.map((w) => [w, dateOfWeekdayThisWeek(today, w)]));
  const weekDates = [...dates.values()].sort();

  const [days, sets] = await Promise.all([
    prisma.planDay.findMany({
      where: { userId: user.id },
      include: { exercises: { orderBy: { position: 'asc' } } },
      orderBy: { weekday: 'asc' },
      ...withJoins,
    }),
    prisma.workoutSet.findMany({
      where: {
        userId: user.id,
        entry: { date: { gte: weekDates[0], lte: weekDates[weekDates.length - 1] } },
      },
      select: { exerciseKey: true, entry: { select: { date: true } } },
      ...withJoins,
    }),
  ]);

  // "date|exerciseKey" -> how many sets were logged.
  const logged = new Map<string, number>();
  for (const set of sets) {
    const k = `${set.entry.date}|${set.exerciseKey}`;
    logged.set(k, (logged.get(k) ?? 0) + 1);
  }

  const byWeekday = new Map(days.map((d) => [d.weekday, d]));

  return NextResponse.json(
    WEEKDAYS.map((weekday) => {
      const day = byWeekday.get(weekday) ?? {
        id: '',
        weekday,
        name: 'Rest',
        exercises: [] as { name: string; exerciseKey: string; sets: number; reps: string }[],
      };
      const date = dates.get(weekday)!;

      const exercises = day.exercises.map((e) => {
        const doneSets = logged.get(`${date}|${e.exerciseKey}`) ?? 0;
        return {
          ...e,
          doneSets,
          // Any logged set counts as started; hitting the target count is
          // "complete". Marking it done only at the full count would leave a
          // 4x6 session that you did three sets of looking untouched.
          done: doneSets > 0,
          complete: doneSets >= e.sets,
        };
      });

      return {
        ...day,
        exercises,
        /** This week's date for this weekday, so the marks can be dated. */
        date,
        /** Nothing can have been logged for a day that hasn't happened. */
        upcoming: date > today,
        isToday: date === today,
        doneCount: exercises.filter((e) => e.done).length,
      };
    }),
  );
}

/**
 * Replaces one weekday's session wholesale. The alternative — diffing exercise
 * rows against what the client sent — buys nothing here: a plan day holds a
 * handful of rows and the editor always submits the whole list.
 */
export async function PUT(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
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
    where: { userId_weekday: { userId: user.id, weekday } },
    create: { userId: user.id, weekday, name, exercises: { create: exercises } },
    update: {
      name,
      // Clear and recreate — see the note above.
      exercises: { deleteMany: {}, create: exercises },
    },
    include: { exercises: { orderBy: { position: 'asc' } } },
  });

  return NextResponse.json(day);
}
