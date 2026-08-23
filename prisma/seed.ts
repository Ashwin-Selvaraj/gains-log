/**
 * Seeds the meal presets from the brief. Safe to re-run — it skips names that
 * already exist rather than creating duplicates.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRESETS = [
  { name: '5 idlis + 2 eggs', calories: 520, protein: 26 },
  { name: 'oats + 3 bananas + whey', calories: 720, protein: 45 },
  { name: 'Rice + dal + curd', calories: 640, protein: 22 },
  { name: 'Whey shake', calories: 130, protein: 25 },
  { name: '4 eggs', calories: 310, protein: 25 },
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

  for (const preset of PRESETS) {
    const existing = await prisma.mealPreset.findFirst({ where: { name: preset.name } });
    if (existing) continue;
    await prisma.mealPreset.create({ data: preset });
    console.log(`+ ${preset.name}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
