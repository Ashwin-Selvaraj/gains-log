import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEntry } from '@/lib/entries';
import { isDateKey } from '@/lib/date';
import { MEAL_SOURCES, type MealSource } from '@/lib/goals';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ date: string }> };

function toIntOrNull(raw: unknown): number | null | undefined {
  if (raw === null || raw === '' || raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined; // signals invalid
  return Math.round(n);
}

export async function POST(req: Request, { params }: Params) {
  const { date } = await params;
  if (!isDateKey(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 });

  const body = (await req.json()) as Record<string, unknown>;
  const name = String(body.name ?? '').trim().slice(0, 200);
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const calories = toIntOrNull(body.calories);
  const protein = toIntOrNull(body.protein);
  if (calories === undefined || protein === undefined) {
    return NextResponse.json({ error: 'calories/protein must be >= 0' }, { status: 400 });
  }

  const source = MEAL_SOURCES.includes(body.source as MealSource)
    ? (body.source as MealSource)
    : 'manual';

  const entry = await getEntry(date);
  const meal = await prisma.mealEntry.create({
    data: {
      name,
      calories,
      protein,
      source,
      photoUrl: typeof body.photoUrl === 'string' ? body.photoUrl : null,
      entryId: entry.id,
    },
  });
  return NextResponse.json(meal, { status: 201 });
}
