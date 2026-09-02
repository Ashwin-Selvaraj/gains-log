/**
 * Seeds the meal presets from the brief. Safe to re-run — it skips names that
 * already exist rather than creating duplicates.
 */
import { PrismaClient } from '@prisma/client';
// Extension required: node --experimental-strip-types resolves this at
// runtime and will not guess it. See allowImportingTsExtensions in tsconfig.
import { FOODS } from './foods.ts';

const foodKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

const prisma = new PrismaClient();

/**
 * Presets are combinations of real Food rows now, not hardcoded numbers — so
 * correcting a food's macros corrects every preset built on it. Grams come from
 * each food's household serving (5 idlis = 5 x 45 g).
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

/**
 * A conventional push/pull/legs split so the Plan and Today screens have
 * something real in them on day one. Edit it on the Plan tab.
 */
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

async function main() {
  await prisma.settings.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton' },
    update: {},
  });

  for (const day of PLAN) {
    const existing = await prisma.planDay.findUnique({ where: { weekday: day.weekday } });
    if (existing) continue;
    await prisma.planDay.create({
      data: {
        weekday: day.weekday,
        name: day.name,
        exercises: {
          create: day.exercises.map(([name, sets, reps], position) => ({
            name, sets, reps, position,
          })),
        },
      },
    });
    console.log(`+ plan: ${day.name} (weekday ${day.weekday})`);
  }

  // --- foods -------------------------------------------------------------
  let added = 0;
  for (const [name, aliases, category, kcal, protein, carbs, fat, fiber, servingLabel, servingGrams] of FOODS) {
    const nameKey = foodKey(name);
    await prisma.food.upsert({
      where: { nameKey },
      // Upsert rather than skip-if-exists: correcting a value in foods.ts and
      // re-seeding should actually correct it in the database.
      create: {
        name, nameKey, aliases, category,
        kcalPer100g: kcal, proteinPer100g: protein, carbsPer100g: carbs,
        fatPer100g: fat, fiberPer100g: fiber, servingLabel, servingGrams,
      },
      update: {
        name, aliases, category,
        kcalPer100g: kcal, proteinPer100g: protein, carbsPer100g: carbs,
        fatPer100g: fat, fiberPer100g: fiber, servingLabel, servingGrams,
      },
    });
    added++;
  }
  console.log(`+ ${added} foods`);

  // --- presets, built from those foods ------------------------------------
  for (const preset of PRESETS) {
    const existing = await prisma.mealPreset.findFirst({ where: { name: preset.name } });
    if (existing) continue;

    const items = [];
    for (const [foodName, grams] of preset.items) {
      const food = await prisma.food.findUnique({ where: { nameKey: foodKey(foodName) } });
      if (!food) {
        console.warn(`  ! preset "${preset.name}" references unknown food "${foodName}"`);
        continue;
      }
      items.push({ foodId: food.id, grams, position: items.length });
    }

    await prisma.mealPreset.create({
      data: { name: preset.name, items: { create: items } },
    });
    console.log(`+ preset: ${preset.name} (${items.length} foods)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
