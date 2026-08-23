import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getEntry } from '@/lib/entries';
import { isDateKey } from '@/lib/date';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ date: string }> };

/** Fields a client is allowed to set, with the coercion each one needs. */
const FIELDS = {
  workoutDone: 'bool',
  walkDone: 'bool',
  learningDone: 'bool',
  sleptWell: 'bool',
  weightKg: 'float',
  sleepHours: 'float',
  walkMinutes: 'int',
  workoutNote: 'text',
  learningNote: 'text',
} as const;

export async function GET(_req: Request, { params }: Params) {
  const { date } = await params;
  if (!isDateKey(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 });
  return NextResponse.json(await getEntry(date));
}

export async function PATCH(req: Request, { params }: Params) {
  const { date } = await params;
  if (!isDateKey(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 });

  const body = (await req.json()) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  for (const [key, kind] of Object.entries(FIELDS)) {
    if (!(key in body)) continue;
    const raw = body[key];

    if (kind === 'bool') {
      data[key] = Boolean(raw);
    } else if (kind === 'text') {
      data[key] = String(raw ?? '').slice(0, 2000);
    } else {
      // Empty string means "cleared", which is distinct from "unchanged".
      if (raw === null || raw === '' || raw === undefined) {
        data[key] = null;
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: `Bad value for ${key}` }, { status: 400 });
        }
        data[key] = kind === 'int' ? Math.round(n) : n;
      }
    }
  }

  const entry = await prisma.dailyEntry.upsert({
    where: { date },
    create: { date, ...data },
    update: data,
    include: {
      meetings: { orderBy: { time: 'asc' } },
      meals: { orderBy: { createdAt: 'asc' } },
    },
  });

  return NextResponse.json(entry);
}
