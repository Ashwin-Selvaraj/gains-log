/**
 * One-time: convert presets created before the Food table existed into
 * food-based ones, so their macros come from the database and stay correct
 * when a food's values are corrected.
 *
 * Idempotent — presets that already have items are left alone, so re-running
 * is harmless. Safe to delete once it has run everywhere it needs to.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const key = (name) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** Legacy preset name -> the foods it's actually made of. */
const CONVERSIONS = {
  '5 idlis + 2 eggs': [
    ['Idli', 225],
    ['Egg, whole boiled', 100],
  ],
  'oats + 3 bananas + whey': [
    ['Oats, dry', 80],
    ['Banana', 360],
    ['Whey protein powder', 30],
  ],
  'rice + dal + curd': [
    ['Rice, cooked white', 300],
    ['Toor dal, cooked', 150],
    ['Curd', 150],
  ],
  'whey shake': [
    ['Whey protein powder', 30],
    ['Milk, toned', 200],
  ],
  '4 eggs': [['Egg, whole boiled', 200]],
};

const presets = await prisma.mealPreset.findMany({ include: { items: true } });

// Drop exact duplicates created by re-seeding under a different capitalisation,
// keeping whichever copy already has food items.
const byKey = new Map();
for (const p of presets) {
  const k = key(p.name);
  const existing = byKey.get(k);
  if (!existing) {
    byKey.set(k, p);
    continue;
  }
  const [keep, drop] =
    p.items.length >= existing.items.length ? [p, existing] : [existing, p];
  byKey.set(k, keep);
  await prisma.mealPreset.delete({ where: { id: drop.id } });
  console.log(`- removed duplicate "${drop.name}" (kept the one with ${keep.items.length} foods)`);
}

for (const preset of byKey.values()) {
  if (preset.items.length > 0) continue;

  const recipe = CONVERSIONS[key(preset.name)];
  if (!recipe) {
    console.log(`  skipped "${preset.name}" — no conversion defined, left as-is`);
    continue;
  }

  const items = [];
  for (const [foodName, grams] of recipe) {
    const food = await prisma.food.findUnique({ where: { nameKey: key(foodName) } });
    if (!food) {
      console.warn(`  ! unknown food "${foodName}" for "${preset.name}"`);
      continue;
    }
    items.push({ foodId: food.id, grams, position: items.length });
  }

  await prisma.mealPreset.update({
    where: { id: preset.id },
    // Legacy macros cleared: with items present they're unused, and leaving
    // stale numbers behind invites them being trusted later.
    data: { items: { create: items }, calories: null, protein: null },
  });
  console.log(`+ converted "${preset.name}" -> ${items.length} foods`);
}

const after = await prisma.mealPreset.findMany({ include: { items: true } });
console.log(
  `\ndone: ${after.length} presets, ${after.filter((p) => p.items.length).length} food-based`,
);
await prisma.$disconnect();
