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

/** Gym shorthand, expanded so "db shoulder press" and "dumbbell shoulder press" are one query. */
const SHORTHAND: Record<string, string> = {
  db: 'dumbbell',
  dbs: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  ez: 'ez-bar',
};

function words(text: string): string[] {
  return nameKeyOf(text)
    .split(/[\s,/()-]+/)
    .filter(Boolean)
    .map((w) => SHORTHAND[w] ?? w);
}

/** Every query word is the start of some word in `target`, in any order. */
function allWordsMatch(queryWords: string[], targetWords: string[]): boolean {
  return queryWords.every((q) => targetWords.some((t) => t.startsWith(q)));
}

/**
 * Ranks a catalogue row against a typed query.
 *
 * Higher is better; 0 means "don't show it". Prefix matches beat substring
 * ones so typing "row" surfaces "Row" and "Rowing" above "Barbell row" — the
 * thing you're most likely reaching for is the one that starts the way you
 * started typing.
 *
 * Word order is ignored past the exact/prefix tiers. People say "shoulder
 * dumbbell press" as often as "dumbbell shoulder press"; matching only the
 * stored order returned nothing for the first, and the picker then offered to
 * create it as a brand-new exercise — splitting that lift's history in two.
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

  const aliasList = row.aliases.toLowerCase().split(',').map((a) => a.trim()).filter(Boolean);
  if (aliasList.includes(q)) return 70;

  const qWords = words(q);
  const nameWords = words(row.name);
  if (allWordsMatch(qWords, nameWords)) {
    // Same words, same count: a reordering of the full name.
    return qWords.length === nameWords.length ? 90 : 60;
  }
  if (aliasList.some((a) => allWordsMatch(qWords, words(a)))) return 50;
  if (name.includes(q)) return 40;
  // Spread across name and aliases — "seated shoulder press" where "seated"
  // only appears in an alias.
  if (allWordsMatch(qWords, [...nameWords, ...aliasList.flatMap(words)])) return 30;

  return 0;
}

const GROUP_HINTS: [MuscleGroupKey, string[]][] = [
  ['shoulders', ['shoulder', 'delt', 'lateral', 'overhead', 'military', 'arnold', 'shrug']],
  ['chest', ['chest', 'bench', 'pec', 'fly', 'push-up', 'pushup']],
  ['back', ['back', 'row', 'pull', 'lat', 'deadlift', 'chin']],
  ['arms', ['curl', 'bicep', 'tricep', 'triceps', 'biceps', 'skull', 'forearm', 'hammer']],
  ['legs', ['squat', 'leg', 'lunge', 'calf', 'quad', 'hamstring']],
  ['glutes', ['glute', 'hip', 'thrust', 'bridge', 'kickback']],
  ['core', ['ab', 'abs', 'core', 'plank', 'crunch', 'oblique']],
  ['cardio', ['run', 'bike', 'cycle', 'treadmill', 'rowing', 'elliptical', 'walk', 'swim']],
];

/** Best guess at a muscle group from a new exercise's name, or null to make the user choose. */
export function guessMuscleGroup(name: string): MuscleGroupKey | null {
  const ws = words(name);
  for (const [group, hints] of GROUP_HINTS) {
    if (ws.some((w) => hints.some((h) => w.startsWith(h)))) return group;
  }
  return null;
}
