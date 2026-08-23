import { prisma } from '@/lib/prisma';
import { withJoins } from '@/lib/db-strategy';
import type { SetLike } from '@/lib/prs';

/**
 * The only place that reads WorkoutSet rows. Its job is to hand plain objects
 * to src/lib/prs.ts, which does the actual maths — keeping I/O and computation
 * apart means the record logic stays testable without a database.
 *
 * A set stores no date of its own; the day it belongs to owns that, so every
 * read joins the parent entry to flatten `date` onto the set.
 */
export async function loadSets(
  filter: { keys?: string[]; since?: string } = {},
): Promise<SetLike[]> {
  const rows = await prisma.workoutSet.findMany({
    where: {
      ...(filter.keys ? { exerciseKey: { in: filter.keys } } : {}),
      ...(filter.since ? { entry: { date: { gte: filter.since } } } : {}),
    },
    include: { entry: { select: { date: true } } },
    orderBy: { createdAt: 'asc' },
    ...withJoins,
  });

  return rows.map((r) => ({
    id: r.id,
    exercise: r.exercise,
    exerciseKey: r.exerciseKey,
    reps: r.reps,
    weightKg: r.weightKg,
    date: r.entry.date,
  }));
}

/** The exercise keys planned for a given weekday. */
export async function planKeysForWeekday(weekday: number): Promise<
  { key: string; name: string; sets: number; reps: string }[]
> {
  const day = await prisma.planDay.findUnique({
    where: { weekday },
    include: { exercises: { orderBy: { position: 'asc' } } },
    ...withJoins,
  });

  return (day?.exercises ?? []).map((e) => ({
    key: e.exerciseKey,
    name: e.name,
    sets: e.sets,
    reps: e.reps,
  }));
}
