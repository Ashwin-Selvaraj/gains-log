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

export type Settings = typeof DEFAULT_SETTINGS & { id: string };

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
