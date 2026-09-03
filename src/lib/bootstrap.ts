import { prisma } from '@/lib/prisma';
import { exerciseKey } from '@/lib/prs';

/**
 * What a brand-new account starts with.
 *
 * These used to live in prisma/seed.ts, back when there was one implicit user
 * and seeding the database and setting up "the user" were the same act. With
 * accounts they are different things: the food table is shared reference data
 * seeded once (see prisma/seed.ts), while a plan, presets and settings belong
 * to a person and have to exist for *everyone* who signs up — not only for
 * whoever happened to run the seed.
 *
 * Called from the createUser event in src/lib/auth.ts, so someone invited today
 * lands on a working app rather than five empty screens.
 */

/** A conventional push/pull/legs split, so Plan and Today aren't blank on day one. */
const PLAN: { weekday: number; name: string; exercises: [string, number, string][] }[] = [
  { weekday: 1, name: 'Push', exercises: [
    ['Bench press', 4, '6-8'], ['Overhead press', 3, '8-10'],
    ['Incline dumbbell press', 3, '8-12'], ['Triceps pushdown', 3, '10-15'] ] },
  { weekday: 2, name: 'Pull', exercises: [
    ['Deadlift', 3, '5'], ['Pull-ups', 4, 'AMRAP'],
    ['Barbell row', 3, '8-10'], ['Barbell curl', 3, '10-12'] ] },
  { weekday: 3, name: 'Legs', exercises: [
    ['Back squat', 4, '6-8'], ['Romanian deadlift', 3, '8-10'],
    ['Leg press', 3, '10-12'], ['Calf raise', 4, '12-15'] ] },
  { weekday: 4, name: 'Rest', exercises: [] },
  { weekday: 5, name: 'Push', exercises: [
    ['Incline bench press', 4, '6-8'], ['Dumbbell shoulder press', 3, '8-12'],
    ['Dips', 3, 'AMRAP'] ] },
  { weekday: 6, name: 'Pull', exercises: [
    ['Barbell row', 4, '6-8'], ['Lat pulldown', 3, '10-12'],
    ['Face pull', 3, '12-15'] ] },
  { weekday: 0, name: 'Rest', exercises: [] },
];

/**
 * Presets are combinations of shared Food rows, not hardcoded numbers — so
 * correcting a food's macros corrects every preset built on it. Grams come from
 * each food's household serving (5 idlis = 5 × 45 g).
 */
const PRESETS: { name: string; items: [foodName: string, grams: number][] }[] = [
  { name: '5 idlis + 2 eggs', items: [['Idli', 225], ['Egg, whole boiled', 100]] },
  { name: 'Oats + 3 bananas + whey', items: [['Oats, dry', 80], ['Banana', 360], ['Whey protein powder', 30]] },
  { name: 'Rice + dal + curd', items: [['Rice, cooked white', 300], ['Toor dal, cooked', 150], ['Curd', 150]] },
  { name: 'Whey shake', items: [['Whey protein powder', 30], ['Milk, toned', 200]] },
  { name: '4 eggs', items: [['Egg, whole boiled', 200]] },
  { name: '2 dosa + sambar + chutney', items: [['Dosa, plain', 140], ['Sambar', 150], ['Coconut chutney', 30]] },
  { name: 'Chicken + rice', items: [['Chicken breast, cooked', 200], ['Rice, cooked white', 250]] },
];

const foodKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Idempotent: each section is skipped if the user already has anything there.
 * That matters because it runs on a sign-in path — a retry, or a second call
 * from a duplicate event, must not double the plan or the preset list.
 */
export async function ensureUserDefaults(userId: string): Promise<void> {
  await prisma.settings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  if ((await prisma.planDay.count({ where: { userId } })) === 0) {
    for (const day of PLAN) {
      await prisma.planDay.create({
        data: {
          userId,
          weekday: day.weekday,
          name: day.name,
          exercises: {
            create: day.exercises.map(([name, sets, reps], position) => ({
              name,
              sets,
              reps,
              position,
              // Stored so plan rows match logged sets by normalised identity
              // rather than by exact spelling — see src/lib/prs.ts.
              exerciseKey: exerciseKey(name),
            })),
          },
        },
      });
    }
  }

  if ((await prisma.mealPreset.count({ where: { userId } })) === 0) {
    // Foods are shared (userId null), so a new account gets working presets
    // without re-importing the whole table for them.
    const foods = await prisma.food.findMany({
      where: { userId: null },
      select: { id: true, nameKey: true },
    });
    const byKey = new Map(foods.map((f) => [f.nameKey, f.id]));

    for (const preset of PRESETS) {
      const items = preset.items
        .map(([foodName, grams]) => ({ foodId: byKey.get(foodKey(foodName)), grams }))
        .filter((i): i is { foodId: string; grams: number } => Boolean(i.foodId))
        .map((i, position) => ({ ...i, position }));

      if (!items.length) continue;
      await prisma.mealPreset.create({
        data: { userId, name: preset.name, items: { create: items } },
      });
    }
  }
}
