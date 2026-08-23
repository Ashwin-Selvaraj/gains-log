import { prisma } from '@/lib/prisma';
import type { DateKey } from '@/lib/date';
import { withJoins } from '@/lib/db-strategy';

const include = {
  meetings: { orderBy: { time: 'asc' } },
  meals: { orderBy: { createdAt: 'asc' } },
} as const;

export type FullEntry = NonNullable<Awaited<ReturnType<typeof peekEntry>>>;

/**
 * Reads a day with its meetings and meals. Never creates a row — rows come into
 * existence via PATCH, or via connectOrCreate when a meal or meeting is added.
 */
export async function peekEntry(date: DateKey) {
  return prisma.dailyEntry.findUnique({ where: { date }, include, ...withJoins });
}

/**
 * Returns the day's row id, creating the row if this is the first thing logged
 * that day.
 *
 * `update: { date }` is a deliberate no-op write rather than `{}`: with a real
 * update clause Prisma compiles this to a single `INSERT ... ON CONFLICT DO
 * UPDATE ... RETURNING`, which is one round trip. An empty update, or a nested
 * `connectOrCreate`, makes Prisma fall back to an interactive transaction —
 * BEGIN, SELECT, INSERT, COMMIT — which is four.
 */
export async function ensureEntryId(date: DateKey): Promise<string> {
  const { id } = await prisma.dailyEntry.upsert({
    where: { date },
    create: { date },
    update: { date },
    select: { id: true },
  });
  return id;
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
