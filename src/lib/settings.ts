import { prisma } from '@/lib/prisma';

/**
 * Targets live in one row so they can be edited in the app rather than in
 * source. The defaults match the schema's, so a fresh database behaves exactly
 * as the hardcoded constants used to.
 */
export const SINGLETON = 'singleton';

export const DEFAULT_SETTINGS = {
  startWeightKg: 68,
  goalWeightKg: 85,
  proteinTarget: 140,
  caloriesMin: 2800,
  caloriesMax: 3100,
  weeklyWorkoutGoal: 5,
} as const;

/**
 * Written out rather than derived from DEFAULT_SETTINGS with `typeof`: the
 * defaults are `as const`, so deriving would give literal types (goalWeightKg:
 * 85) that a row loaded from the database can never satisfy.
 */
export type Settings = {
  id: string;
  startWeightKg: number;
  goalWeightKg: number;
  proteinTarget: number;
  caloriesMin: number;
  caloriesMax: number;
  weeklyWorkoutGoal: number;
};

/**
 * Read-only. Falls back to the defaults in memory rather than creating the row,
 * so rendering a report never writes — an upsert here put a write on the
 * critical path of every read, for a row that only ever changes when you edit
 * a goal.
 */
export async function readSettings(): Promise<Settings> {
  const row = await prisma.settings.findUnique({ where: { id: SINGLETON } });
  return row ?? { id: SINGLETON, ...DEFAULT_SETTINGS };
}

/** Use when the row genuinely needs to exist, i.e. before writing to it. */
export async function getSettings() {
  return prisma.settings.upsert({
    where: { id: SINGLETON },
    create: { id: SINGLETON },
    update: { id: SINGLETON },
  });
}

/** Field name -> [min, max]. Keeps a typo from making the report nonsense. */
export const SETTINGS_BOUNDS: Record<keyof typeof DEFAULT_SETTINGS, [number, number]> = {
  startWeightKg: [20, 400],
  goalWeightKg: [20, 400],
  proteinTarget: [0, 500],
  caloriesMin: [0, 20000],
  caloriesMax: [0, 20000],
  weeklyWorkoutGoal: [0, 14],
};
