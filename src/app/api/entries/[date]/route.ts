import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { blankEntry, peekEntry } from '@/lib/entries';
import { isDateKey } from '@/lib/date';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ date: string }> };

/** Fields a client is allowed to set, with the coercion each one needs. */
const FIELDS = {
  workoutDone: 'bool',
  waterDone: 'bool',
  learningDone: 'bool',
  sleptWell: 'bool',
  weightKg: 'float',
  sleepHours: 'float',
  waterLitres: 'float',
  workoutNote: 'text',
  learningNote: 'text',
} as const;

export async function GET(_req: Request, { params }: Params) {
  const { date } = await params;
  if (!isDateKey(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 });

  // Read-only: opening the app shouldn't write a row. Creating one on every page
  // load costs a write round trip on the critical path and litters the table with
  // blank days. The row gets created by the first PATCH or child insert instead.
  const entry = await peekEntry(date);
  return NextResponse.json(entry ?? blankEntry(date));
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
        data[key] = n;
      }
    }
  }

  // No `include` here: the client already has the meetings and meals it drew,
  // and pulling them back on every debounced keystroke costs two extra round
  // trips to a database that may be a continent away.
  const entry = await prisma.dailyEntry.upsert({
    where: { date },
    create: { date, ...data },
    update: data,
  });

  return NextResponse.json(entry);
}
