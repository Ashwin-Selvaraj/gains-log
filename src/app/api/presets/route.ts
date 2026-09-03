import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withJoins } from '@/lib/db-strategy';
import { macrosFor, sumMacros, type Macros } from '@/lib/nutrition';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const include = {
  items: { include: { food: true }, orderBy: { position: 'asc' } },
} as const;

type PresetRow = Awaited<
  ReturnType<typeof prisma.mealPreset.findFirstOrThrow<{ include: typeof include }>>
>;

/**
 * Presets carry their computed macros so the Today screen can show them
 * without doing the arithmetic itself — and because they're computed from the
 * foods rather than stored, correcting a food corrects every preset using it.
 */
export function withMacros(preset: PresetRow) {
  const macros: Macros = preset.items.length
    ? sumMacros(preset.items.map((i) => macrosFor(i.food, i.grams)))
    : // Legacy preset predating the food table.
      {
        kcal: preset.calories ?? 0,
        protein: preset.protein ?? 0,
        carbs: 0,
        fat: 0,
        fiber: 0,
      };

  return {
    id: preset.id,
    name: preset.name,
    macros,
    items: preset.items.map((i) => ({
      id: i.id,
      foodId: i.foodId,
      name: i.food.name,
      grams: i.grams,
      servingLabel: i.food.servingLabel,
      servingGrams: i.food.servingGrams,
    })),
    /** True when nothing links it to the food table yet. */
    legacy: preset.items.length === 0,
  };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const presets = await prisma.mealPreset.findMany({
    where: { userId: user.id },
    include,
    orderBy: { createdAt: 'asc' },
    ...withJoins,
  });
  return NextResponse.json(presets.map(withMacros));
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const body = (await req.json()) as Record<string, unknown>;
  const name = String(body.name ?? '').trim().slice(0, 200);
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .map((raw, position) => {
      const item = raw as Record<string, unknown>;
      const grams = Number(item.grams);
      return {
        foodId: String(item.foodId ?? ''),
        grams: Number.isFinite(grams) && grams > 0 ? grams : 0,
        position,
      };
    })
    .filter((i) => i.foodId && i.grams > 0);

  const preset = await prisma.mealPreset.create({
    data: {
      userId: user.id,
      name,
      items: { create: items },
      // Manual macros only apply to a preset with no foods behind it.
      calories: items.length ? null : toIntOrNull(body.calories),
      protein: items.length ? null : toIntOrNull(body.protein),
    },
    include,
  });

  return NextResponse.json(withMacros(preset), { status: 201 });
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}
