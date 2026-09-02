import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withMacros } from '@/app/api/presets/route';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const include = {
  items: { include: { food: true }, orderBy: { position: 'asc' } },
} as const;

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 200);
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    data.name = name;
  }

  // Items are replaced wholesale — a preset holds a handful of rows and the
  // editor always submits the whole list, so diffing buys nothing here.
  if (Array.isArray(body.items)) {
    const items = body.items
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

    data.items = { deleteMany: {}, create: items };
    // Once it's food-based, stale manual numbers would only mislead.
    if (items.length) {
      data.calories = null;
      data.protein = null;
    }
  }

  const preset = await prisma.mealPreset.update({ where: { id }, data, include });
  return NextResponse.json(withMacros(preset));
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await prisma.mealPreset.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
