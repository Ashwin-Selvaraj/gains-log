import { prisma } from '@/lib/prisma';
import type { DateKey } from '@/lib/date';

const include = {
  meetings: { orderBy: { time: 'asc' } },
  meals: { orderBy: { createdAt: 'asc' } },
} as const;

export type FullEntry = Awaited<ReturnType<typeof getEntry>>;

/** Fetches the day, creating an empty row on first touch so children can attach. */
export async function getEntry(date: DateKey) {
  const existing = await prisma.dailyEntry.findUnique({ where: { date }, include });
  if (existing) return existing;
  return prisma.dailyEntry.create({ data: { date }, include });
}

/** Read-only variant — does not create a row for a day that was never logged. */
export async function peekEntry(date: DateKey) {
  return prisma.dailyEntry.findUnique({ where: { date }, include });
}

/** An entry with no habits, no numbers and no children isn't worth showing. */
export function isEmptyEntry(e: {
  workoutDone: boolean;
  walkDone: boolean;
  learningDone: boolean;
  sleptWell: boolean;
  weightKg: number | null;
  sleepHours: number | null;
  walkMinutes: number | null;
  workoutNote: string;
  learningNote: string;
  meetings: unknown[];
  meals: unknown[];
}) {
  return (
    !e.workoutDone &&
    !e.walkDone &&
    !e.learningDone &&
    !e.sleptWell &&
    e.weightKg === null &&
    e.sleepHours === null &&
    e.walkMinutes === null &&
    !e.workoutNote &&
    !e.learningNote &&
    e.meetings.length === 0 &&
    e.meals.length === 0
  );
}
