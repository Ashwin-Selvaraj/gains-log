/**
 * Fills exerciseKey on rows created before the column existed.
 * Idempotent — safe to re-run. Keep the normalisation identical to
 * exerciseKey() in src/lib/prs.ts.
 */
import { PrismaClient } from '@prisma/client';

const key = (name) => name.trim().toLowerCase().replace(/\s+/g, ' ');
const prisma = new PrismaClient();

let updated = 0;

for (const row of await prisma.workoutSet.findMany({ where: { exerciseKey: '' } })) {
  await prisma.workoutSet.update({
    where: { id: row.id },
    data: { exerciseKey: key(row.exercise) },
  });
  updated++;
}

for (const row of await prisma.planExercise.findMany({ where: { exerciseKey: '' } })) {
  await prisma.planExercise.update({
    where: { id: row.id },
    data: { exerciseKey: key(row.name) },
  });
  updated++;
}

console.log(`backfilled ${updated} row(s)`);
console.log('remaining blank:', {
  sets: await prisma.workoutSet.count({ where: { exerciseKey: '' } }),
  planExercises: await prisma.planExercise.count({ where: { exerciseKey: '' } }),
});
await prisma.$disconnect();
