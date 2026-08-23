import { prisma } from '@/lib/prisma';
import type { DateKey } from '@/lib/date';

const include = {
  meetings: { orderBy: { time: 'asc' } },
  meals: { orderBy: { createdAt: 'asc' } },
} as const;

export type FullEntry = Awaited<ReturnType<typeof getEntry>>;

/**
 * Fetches the day, creating an empty row on first touch so meals and meetings
 * have something to attach to. A single upsert rather than find-then-create —
 * over a hosted Postgres, the second round trip is the expensive one.
 */
export async function getEntry(date: DateKey) {
  return prisma.dailyEntry.upsert({
    where: { date },
    create: { date },
    update: {},
    include,
  });
}

/** Read-only variant — does not create a row for a day that was never logged. */
export async function peekEntry(date: DateKey) {
  return prisma.dailyEntry.findUnique({ where: { date }, include });
}

/**
 * The shape the client expects for a day that has no row yet. Lets reads stay
 * read-only while the UI still renders a fully editable day.
 */
export function blankEntry(date: DateKey) {
  return {
    id: '',
    date,
    workoutDone: false,
    walkDone: false,
    learningDone: false,
    sleptWell: false,
    weightKg: null,
    sleepHours: null,
    walkMinutes: null,
    workoutNote: '',
    learningNote: '',
    meetings: [],
    meals: [],
  };
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
