import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureEntryId } from '@/lib/entries';
import { isDateKey } from '@/lib/date';
import { MEAL_SOURCES, type MealSource } from '@/lib/goals';
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
      photoUrl: typeof body.photoUrl === 'string' ? body.photoUrl : null,
      userId: user.id,
      entryId: await ensureEntryId(user.id, date),
    },
  });

  return NextResponse.json(meal, { status: 201 });
}
