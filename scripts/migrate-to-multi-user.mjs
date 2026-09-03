/**
 * One-time migration from the single-user schema to the multi-user one.
 *
 * The new ownership columns are non-nullable, so `prisma db push` cannot keep
 * existing rows on its own — it would have to invent an owner for them. This
 * script makes that explicit and reversible:
 *
 *   1. node scripts/migrate-to-multi-user.mjs export      (BEFORE db push)
 *   2. npm run db:push
 *   3. sign in once with Google to create your User row
 *   4. node scripts/migrate-to-multi-user.mjs import you@email.com
 *
 * Step 1 writes backup-pre-auth.json, which is a plain readable backup you can
 * keep regardless of whether the rest goes to plan.
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync, writeFileSync } from 'node:fs';

const prisma = new PrismaClient();
const mode = process.argv[2];
const FILE = 'backup-pre-auth.json';

if (mode === 'export') {
  const data = {
    exportedAt: new Date().toISOString(),
    entries: await prisma.dailyEntry.findMany({
      include: { meetings: true, meals: true, sets: true, photos: true },
    }),
    presets: await prisma.mealPreset.findMany({ include: { items: true } }),
    planDays: await prisma.planDay.findMany({ include: { exercises: true } }),
    settings: await prisma.settings.findFirst(),
    carried: await prisma.carriedExercise.findMany(),
  };
  writeFileSync(FILE, JSON.stringify(data, null, 2));
  console.log(`wrote ${FILE}`);
  console.log(`  ${data.entries.length} days, ` +
    `${data.entries.reduce((n, e) => n + e.sets.length, 0)} sets, ` +
    `${data.entries.reduce((n, e) => n + e.meals.length, 0)} meals, ` +
    `${data.presets.length} presets, ${data.planDays.length} plan days`);
  console.log('\nFoods are not exported: the seeded table is shared (userId null)');
  console.log('and is recreated by `npm run db:seed`.');
}

else if (mode === 'import') {
  const email = process.argv[3];
  if (!email) {
    console.error('usage: node scripts/migrate-to-multi-user.mjs import you@email.com');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user with email ${email}. Sign in with Google first, then re-run.`);
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(FILE, 'utf8'));
  const userId = user.id;

  // Ids are reused so anything referencing them still lines up, and so a second
  // run collides on the primary key rather than silently duplicating the data.
  for (const e of data.entries) {
    const { meetings, meals, sets, photos, ...entry } = e;
    await prisma.dailyEntry.create({
      data: {
        ...entry, userId,
        meetings: { create: meetings.map(({ entryId, ...m }) => ({ ...m, userId })) },
        meals: { create: meals.map(({ entryId, ...m }) => ({ ...m, userId })) },
        sets: { create: sets.map(({ entryId, ...s }) => ({ ...s, userId })) },
        photos: { create: photos.map(({ entryId, ...p }) => ({ ...p, userId })) },
      },
    });
  }

  for (const d of data.planDays) {
    const { exercises, ...day } = d;
    await prisma.planDay.create({
      data: { ...day, userId, exercises: { create: exercises.map(({ planDayId, ...x }) => x) } },
    });
  }

  for (const p of data.presets) {
    const { items, ...preset } = p;
    await prisma.mealPreset.create({
      data: { ...preset, userId, items: { create: items.map(({ presetId, ...i }) => i) } },
    });
  }

  for (const c of data.carried) await prisma.carriedExercise.create({ data: { ...c, userId } });

  if (data.settings) {
    const { id, userId: _old, ...rest } = data.settings;
    await prisma.settings.upsert({
      where: { userId }, create: { ...rest, userId }, update: rest,
    });
  }

  console.log(`restored everything under ${email}`);
  console.log(`  ${data.entries.length} days, ${data.planDays.length} plan days, ${data.presets.length} presets`);
}

else {
  console.error('usage: migrate-to-multi-user.mjs export | import <email>');
  process.exit(1);
}

await prisma.$disconnect();
