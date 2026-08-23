import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  DEFAULT_SETTINGS,
  SETTINGS_BOUNDS,
  SINGLETON,
  getSettings,
} from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getSettings());
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  const data: Record<string, number> = {};

  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) {
    if (!(key in body)) continue;
    const n = Number(body[key]);
    const [min, max] = SETTINGS_BOUNDS[key];
    if (!Number.isFinite(n) || n < min || n > max) {
      return NextResponse.json(
        { error: `${key} must be between ${min} and ${max}` },
        { status: 400 },
      );
    }
    // Only weight targets are fractional; the rest are whole numbers.
    data[key] = key.endsWith('Kg') ? n : Math.round(n);
  }

  if (data.caloriesMin !== undefined && data.caloriesMax !== undefined
      && data.caloriesMin > data.caloriesMax) {
    return NextResponse.json(
      { error: 'Calorie floor cannot exceed the ceiling' },
      { status: 400 },
    );
  }

  return NextResponse.json(
    await prisma.settings.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, ...data },
      update: data,
    }),
  );
}
