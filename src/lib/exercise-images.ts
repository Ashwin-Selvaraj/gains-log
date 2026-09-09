import { prisma } from '@/lib/prisma';

/**
 * Which picture to show for an exercise, for one person.
 *
 * Three layers, in order: the photo they uploaded themselves, then the shared
 * catalogue illustration, then nothing — and nothing is a normal answer. A few
 * lifts have no honest match upstream, and every exercise someone adds by hand
 * starts without one, so callers render the muscle-group icon rather than a
 * broken frame.
 *
 * Resolved in one query per layer rather than per exercise: the workout card
 * asks for a whole day's worth at once, and the picker asks for a page of
 * search results.
 */
export async function resolveExerciseImages(
  userId: string,
  keys: string[],
): Promise<Map<string, string>> {
  const wanted = [...new Set(keys.filter(Boolean))];
  if (wanted.length === 0) return new Map();

  const [catalogue, overrides] = await Promise.all([
    prisma.exercise.findMany({
      where: { nameKey: { in: wanted }, imageUrl: { not: '' } },
      select: { nameKey: true, imageUrl: true, userId: true },
    }),
    prisma.exerciseImage.findMany({
      where: { userId, exerciseKey: { in: wanted } },
      select: { exerciseKey: true, url: true },
    }),
  ]);

  const out = new Map<string, string>();
  // A personal Exercise row beats the shared one of the same name, so shared
  // rows go in first and are overwritten rather than the other way round.
  for (const row of catalogue.filter((r) => r.userId === null)) {
    out.set(row.nameKey, row.imageUrl);
  }
  for (const row of catalogue.filter((r) => r.userId === userId)) {
    out.set(row.nameKey, row.imageUrl);
  }
  for (const row of overrides) out.set(row.exerciseKey, row.url);
  return out;
}
