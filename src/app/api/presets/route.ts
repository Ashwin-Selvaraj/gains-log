import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    await prisma.mealPreset.findMany({ orderBy: { createdAt: 'asc' } }),
  );
}

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  const name = String(body.name ?? '').trim().slice(0, 200);
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

  const num = (v: unknown) => {
    if (v === null || v === '' || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };

  const preset = await prisma.mealPreset.create({
    data: { name, calories: num(body.calories), protein: num(body.protein) },
  });
  return NextResponse.json(preset, { status: 201 });
}
