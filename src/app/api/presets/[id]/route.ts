import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const num = (v: unknown) => {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 200);
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
    data.name = name;
  }
  if (body.calories !== undefined) data.calories = num(body.calories);
  if (body.protein !== undefined) data.protein = num(body.protein);

  return NextResponse.json(await prisma.mealPreset.update({ where: { id }, data }));
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await prisma.mealPreset.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
