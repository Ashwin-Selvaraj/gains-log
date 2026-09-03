import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const NUMERIC = [
  'kcalPer100g',
  'proteinPer100g',
  'carbsPer100g',
  'fatPer100g',
  'fiberPer100g',
  'servingGrams',
] as const;

/**
 * Correct a food's values. Published composition figures are averages — your
 * dosa carries whatever oil your kitchen uses — so these are meant to be
 * edited. Logged meals keep their own macro snapshot and are unaffected;
 * presets built on this food recalculate.
 */
export async function PATCH(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  for (const field of NUMERIC) {
    if (!(field in body)) continue;
    const n = Number(body[field]);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json({ error: `${field} must be >= 0` }, { status: 400 });
    }
    data[field] = n;
  }

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 120);
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    data.name = name;
  }
  if (body.aliases !== undefined) {
    data.aliases = String(body.aliases).trim().toLowerCase().slice(0, 300);
  }
  if (body.servingLabel !== undefined) {
    data.servingLabel = String(body.servingLabel).trim().slice(0, 40) || '100 g';
  }

  // Shared foods are read-only: one person's correction would silently change
  // everyone else's future logs. Editing one is refused rather than ignored.
  const food = await prisma.food.findUnique({ where: { id } });
  if (!food) return NextResponse.json({ error: 'No such food' }, { status: 404 });
  if (food.userId !== user.id) {
    return NextResponse.json(
      {
        error:
          food.userId === null
            ? 'This is a shared food and cannot be edited. Add your own version instead.'
            : 'Not your food.',
      },
      { status: 403 },
    );
  }

  return NextResponse.json(await prisma.food.update({ where: { id }, data }));
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const removed = await prisma.food.deleteMany({ where: { id, userId: user.id } });
  if (removed.count === 0) {
    return NextResponse.json(
      { error: 'Not your food, or it is a shared one.' },
      { status: 403 },
    );
  }
  return new NextResponse(null, { status: 204 });
}
