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

async function main() {
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
