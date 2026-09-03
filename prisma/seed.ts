/**
 * Seeds the shared food table. Safe to re-run.
 *
 * Only shared data lives here. Everything that belongs to a person — settings,
 * the training plan, meal presets — is created per account by
 * ensureUserDefaults() in src/lib/bootstrap.ts when they first sign in. Seeding
 * those here would only ever have set up whichever account happened to exist
 * when the command was run.
 */
import { PrismaClient } from '@prisma/client';
// Extension required: node --experimental-strip-types resolves this at
// runtime and will not guess it. See allowImportingTsExtensions in tsconfig.
import { FOODS } from './foods.ts';

const foodKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

const prisma = new PrismaClient();

async function main() {
  let created = 0;
  let updated = 0;

  for (const [name, aliases, category, kcal, protein, carbs, fat, fiber, servingLabel, servingGrams] of FOODS) {
    const nameKey = foodKey(name);
    const values = {
      name, aliases, category,
      kcalPer100g: kcal, proteinPer100g: protein, carbsPer100g: carbs,
      fatPer100g: fat, fiberPer100g: fiber, servingLabel, servingGrams,
    };

    // findFirst + create/update rather than upsert: the unique key is now
    // [userId, nameKey], and a compound unique cannot be addressed with a null
    // userId. Shared foods are exactly the rows where userId is null, so they
    // have to be matched with an ordinary filter.
    const existing = await prisma.food.findFirst({
      where: { userId: null, nameKey },
      select: { id: true },
    });

    if (existing) {
      // Updating rather than skipping means correcting a value in foods.ts and
      // re-seeding actually corrects it in the database.
      await prisma.food.update({ where: { id: existing.id }, data: values });
      updated++;
    } else {
      await prisma.food.create({ data: { ...values, nameKey } });
      created++;
    }
  }

  console.log(`foods: ${created} created, ${updated} updated (shared across all accounts)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
