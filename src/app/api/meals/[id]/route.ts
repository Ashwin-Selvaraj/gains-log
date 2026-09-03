import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';
import { deletePhoto } from '@/lib/storage';
import { logDeletion } from '@/lib/audit';
import { MEAL_SLOT_KEYS, type MealSlot } from '@/lib/goals';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Moves a meal to a different slot.
 *
 * The slot is guessed from the clock when the meal is logged, and the guess is
 * wrong often enough to matter — a late lunch at 4pm is recorded as a snack.
 * Correcting it must not touch the macros, which are a snapshot.
 */
export async function PATCH(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const body = (await req.json()) as { slot?: string };
  if (!MEAL_SLOT_KEYS.includes(body.slot as MealSlot)) {
    return NextResponse.json({ error: 'Unknown meal slot.' }, { status: 400 });
  }

  const { count } = await prisma.mealEntry.updateMany({
    where: { id, userId: user.id },
    data: { slot: body.slot as MealSlot },
  });
  if (!count) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  return NextResponse.json(
    await prisma.mealEntry.findUniqueOrThrow({ where: { id } }),
  );
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;

  // findFirst scoped by owner, so another account's id simply does not
  // resolve — and it's what lets the delete below log what it actually removed.
  const meal = await prisma.mealEntry.findFirst({ where: { id, userId: user.id } });
  if (!meal) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // Photo.mealId has no foreign key — it's a plain column, not a relation —
  // so deleting the meal would never cascade to it. Without this, every
  // AI-estimated meal that gets removed leaves its photo behind in R2 forever.
  const photos = await prisma.photo.findMany({
    where: { mealId: id, userId: user.id },
    select: { id: true, key: true },
  });
  for (const photo of photos) {
    try {
      await deletePhoto(photo.key);
    } catch (err) {
      console.warn('[meals] bucket delete failed, removing row anyway', err);
    }
  }
  if (photos.length) {
    await prisma.photo.deleteMany({ where: { id: { in: photos.map((p) => p.id) } } });
  }

  await prisma.mealEntry.delete({ where: { id } });
  logDeletion(user.email, 'meal', `"${meal.name}" (${meal.calories ?? '?'} kcal, id ${id})`);
  return new NextResponse(null, { status: 204 });
}
