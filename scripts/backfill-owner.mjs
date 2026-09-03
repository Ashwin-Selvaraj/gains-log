/**
 * Assigns every pre-auth row to one account.
 *
 * Part of the single-user → multi-user migration. Run once, between the
 * nullable-column push and the final push that makes those columns required:
 *
 *   node scripts/backfill-owner.mjs you@gmail.com
 *
 * The User row is created here rather than waiting for a first sign-in, because
 * the columns cannot be made non-nullable until every existing row has an owner.
 * Google sign-in then attaches to this row by email — see the account-linking
 * note in src/lib/auth.ts.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const email = (process.argv[2] ?? '').trim().toLowerCase();

if (!email || !email.includes('@')) {
  console.error('usage: node scripts/backfill-owner.mjs you@gmail.com');
  process.exit(1);
}

const user = await prisma.user.upsert({
  where: { email },
  create: { email, name: email.split('@')[0] },
  update: {},
});
console.log(`user: ${user.email} (${user.id})`);

await prisma.allowedEmail.upsert({
  where: { email },
  create: { email, note: 'owner — seeded by the auth migration' },
  update: {},
});
console.log('added to the invite allowlist');

const userId = user.id;
const owned = [
  ['dailyEntry', prisma.dailyEntry],
  ['meeting', prisma.meeting],
  ['mealEntry', prisma.mealEntry],
  ['workoutSet', prisma.workoutSet],
  ['photo', prisma.photo],
  ['planDay', prisma.planDay],
  ['mealPreset', prisma.mealPreset],
  ['carriedExercise', prisma.carriedExercise],
  ['pushSubscription', prisma.pushSubscription],
  ['notificationLog', prisma.notificationLog],
];

for (const [name, model] of owned) {
  const { count } = await model.updateMany({ where: { userId: null }, data: { userId } });
  if (count) console.log(`  ${name}: ${count} row(s) assigned`);
}

// Settings was a single "singleton" row; it becomes this user's row.
const settings = await prisma.settings.findFirst({ where: { userId: null } });
if (settings) {
  await prisma.settings.update({ where: { id: settings.id }, data: { userId } });
  console.log('  settings: assigned');
}

// Foods deliberately keep userId null: the seeded table is shared reference
// data that every user reads. Only foods a user adds themselves are owned.
const shared = await prisma.food.count({ where: { userId: null } });
console.log(`\n${shared} foods left shared (userId null) — visible to everyone, as intended`);

await prisma.$disconnect();
