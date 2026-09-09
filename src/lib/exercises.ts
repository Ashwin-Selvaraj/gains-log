/**
 * Muscle groups, and how an exercise name is normalised for lookup.
 *
 * Pure constants and string work — no Prisma, no React — so the seed script,
 * the API routes and the client picker all agree on the same vocabulary
 * without any of them importing a database.
 */

export const MUSCLE_GROUPS = [
  { key: 'chest', label: 'Chest', icon: '🫀' },
  { key: 'back', label: 'Back', icon: '🔙' },
  { key: 'shoulders', label: 'Shoulders', icon: '🪖' },
  { key: 'arms', label: 'Arms', icon: '💪' },
  { key: 'legs', label: 'Legs', icon: '🦵' },
  { key: 'glutes', label: 'Glutes', icon: '🍑' },
  { key: 'core', label: 'Core', icon: '🧱' },
  { key: 'cardio', label: 'Cardio', icon: '🏃' },
] as const;

export type MuscleGroupKey = (typeof MUSCLE_GROUPS)[number]['key'];

export const MUSCLE_GROUP_KEYS = MUSCLE_GROUPS.map((g) => g.key) as readonly string[];

export function muscleGroupLabel(key: string): string {
  return MUSCLE_GROUPS.find((g) => g.key === key)?.label ?? 'Other';
}

/**
 * The same normalisation WorkoutSet.exerciseKey already uses (see
 * src/lib/prs.ts). Duplicated here rather than imported because prs.ts is the
 * records module and this is the catalogue — but they must agree, which is
 * what the test in the seed script checks.
 */
export function nameKeyOf(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Ranks a catalogue row against a typed query.
 *
 * Higher is better; 0 means "don't show it". Prefix matches beat substring
 * ones so typing "row" surfaces "Row" and "Rowing" above "Barbell row" — the
 * thing you're most likely reaching for is the one that starts the way you
 * started typing.
 */
export function scoreMatch(
  query: string,
  row: { name: string; aliases: string },
): number {
  const q = nameKeyOf(query);
  if (!q) return 1;

  const name = nameKeyOf(row.name);
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;

  // A word inside the name — "bench" finding "Incline bench press".
  if (name.split(' ').some((w) => w.startsWith(q))) return 60;
  if (name.includes(q)) return 40;

  const aliases = row.aliases.toLowerCase();
  if (aliases.split(',').some((a) => a.trim() === q)) return 70;
  if (aliases.includes(q)) return 30;

  return 0;
}
