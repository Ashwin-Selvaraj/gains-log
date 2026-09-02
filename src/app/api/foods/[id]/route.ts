import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

  return NextResponse.json(await prisma.food.update({ where: { id }, data }));
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await prisma.food.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
