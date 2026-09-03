import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureEntryId } from '@/lib/entries';
import { isDateKey } from '@/lib/date';
import { MEAL_SLOT_KEYS, MEAL_SOURCES, type MealSlot, type MealSource } from '@/lib/goals';
import { macrosFor, sumMacros, type Macros } from '@/lib/nutrition';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ date: string }> };

function toNumOrNull(raw: unknown): number | null | undefined {
  if (raw === null || raw === '' || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined; // signals invalid
  return n;
}

/**
 * Logs a meal. Three shapes come in here:
 *   { foodId, grams }   — picked from the food database
 *   { presetId }        — a saved combination of foods
 *   { name, calories … } — typed by hand, for anything not in the table
 *
 * In every case the macros are computed server-side and stored as a *snapshot*
 * on the meal. Correcting a food's values later fixes future logs and presets,
 * but never silently rewrites what you already ate.
 */
export async function POST(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { date } = await params;
  if (!isDateKey(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 });

  const body = (await req.json()) as Record<string, unknown>;

  let name = String(body.name ?? '').trim().slice(0, 200);
  let macros: Macros | null = null;
  let foodId: string | null = null;
  let grams: number | null = null;
  let source: MealSource = MEAL_SOURCES.includes(body.source as MealSource)
    ? (body.source as MealSource)
    : 'manual';

  // Falls back to "snack" rather than guessing from the server clock: the
  // server runs in Singapore, so its idea of breakfast time is not the user's.
  // The client sends the slot it worked out from the phone's own clock.
  const slot: MealSlot = MEAL_SLOT_KEYS.includes(body.slot as MealSlot)
    ? (body.slot as MealSlot)
    : 'snack';

  // --- from a single food -------------------------------------------------
  if (typeof body.foodId === 'string' && body.foodId) {
    // Shared foods (userId null) plus the caller's own; never someone else's.
    const food = await prisma.food.findFirst({
      where: { id: body.foodId, OR: [{ userId: null }, { userId: user.id }] },
    });
    if (!food) return NextResponse.json({ error: 'Unknown food' }, { status: 404 });

    const g = Number(body.grams);
    if (!Number.isFinite(g) || g <= 0 || g > 5000) {
      return NextResponse.json({ error: 'grams must be 1-5000' }, { status: 400 });
    }

    macros = macrosFor(food, g);
    foodId = food.id;
    grams = g;
    if (!name) name = food.name;
    if (source === 'manual') source = 'food';
  }

  // --- from a preset ------------------------------------------------------
  else if (typeof body.presetId === 'string' && body.presetId) {
    const preset = await prisma.mealPreset.findFirst({
      where: { id: body.presetId, userId: user.id },
      include: { items: { include: { food: true }, orderBy: { position: 'asc' } } },
    });
    if (!preset) return NextResponse.json({ error: 'Unknown preset' }, { status: 404 });

    name = preset.name;
    source = 'preset';

    if (preset.items.length > 0) {
      macros = sumMacros(preset.items.map((i) => macrosFor(i.food, i.grams)));
      grams = preset.items.reduce((sum, i) => sum + i.grams, 0);
    } else {
      // Legacy preset with no foods behind it — carry its stored numbers.
      macros = {
        kcal: preset.calories ?? 0,
        protein: preset.protein ?? 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
      };
    }
  }

  // --- typed by hand ------------------------------------------------------
  else {
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

    const parsed = {
      kcal: toNumOrNull(body.calories),
      protein: toNumOrNull(body.protein),
      carbs: toNumOrNull(body.carbs),
      fat: toNumOrNull(body.fat),
      fiber: toNumOrNull(body.fiber),
    };
    if (Object.values(parsed).some((v) => v === undefined)) {
      return NextResponse.json({ error: 'macros must be >= 0' }, { status: 400 });
    }

    macros = {
      kcal: parsed.kcal ?? 0,
      protein: parsed.protein ?? 0,
      carbs: parsed.carbs ?? 0,
      fat: parsed.fat ?? 0,
      fiber: parsed.fiber ?? 0,
    };
  }

  const meal = await prisma.mealEntry.create({
    data: {
      name,
      calories: Math.round(macros.kcal),
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      fiber: macros.fiber,
      foodId,
      grams,
      source,
      slot,
      photoUrl: typeof body.photoUrl === 'string' ? body.photoUrl : null,
      userId: user.id,
      entryId: await ensureEntryId(user.id, date),
    },
  });

  // photoId names an R2-backed Photo row already uploaded via POST /api/photos
  // (kind "meal") before this request was made — see PhotoEstimate.save(). The
  // meal's photoUrl above is enough to render it; this backlink is what lets
  // DELETE /api/meals/[id] find and clean up the R2 object rather than leaving
  // it orphaned in the bucket.
  if (typeof body.photoId === 'string' && body.photoId) {
    await prisma.photo.updateMany({
      where: { id: body.photoId, userId: user.id, mealId: null },
      data: { mealId: meal.id },
    });
  }

  return NextResponse.json(meal, { status: 201 });
}
