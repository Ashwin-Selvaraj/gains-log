import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { foodKey, searchFoods } from '@/lib/nutrition';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Food search. The whole table is ~100 rows and every row is tiny, so it's
 * loaded once and ranked in memory by src/lib/nutrition.ts rather than pushed
 * into SQL — that keeps ranking logic (aliases, prefix vs. substring) in one
 * pure, testable place instead of split across a query.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const params = new URL(req.url).searchParams;
  const q = params.get('q')?.trim() ?? '';
  const limit = Math.min(Number(params.get('limit') ?? 20) || 20, 100);

  // Shared seeded foods (userId null) plus this user's own additions.
  const foods = await prisma.food.findMany({
    where: { OR: [{ userId: null }, { userId: user.id }] },
    orderBy: { name: 'asc' },
  });

  // No query: a browsable list rather than nothing, so the picker is useful
  // before you've typed anything.
  return NextResponse.json(q ? searchFoods(foods, q, limit) : foods.slice(0, limit));
}

/** Add a food the table doesn't have yet. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const body = (await req.json()) as Record<string, unknown>;
  const name = String(body.name ?? '').trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const num = (v: unknown, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const nameKey = foodKey(name);
  if (await prisma.food.findFirst({ where: { nameKey, userId: user.id } })) {
    return NextResponse.json({ error: `"${name}" already exists` }, { status: 409 });
  }

  const food = await prisma.food.create({
    data: {
      // Always owned: users add to their own table, never to the shared one.
      userId: user.id,
      name,
      nameKey,
      aliases: String(body.aliases ?? '').trim().toLowerCase().slice(0, 300),
      category: String(body.category ?? 'other').trim().slice(0, 40),
      kcalPer100g: num(body.kcalPer100g),
      proteinPer100g: num(body.proteinPer100g),
      carbsPer100g: num(body.carbsPer100g),
      fatPer100g: num(body.fatPer100g),
      fiberPer100g: num(body.fiberPer100g),
      servingLabel: String(body.servingLabel ?? '100 g').trim().slice(0, 40),
      servingGrams: num(body.servingGrams, 100) || 100,
    },
  });
  return NextResponse.json(food, { status: 201 });
}
