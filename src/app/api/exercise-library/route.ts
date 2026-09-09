import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';
import {
  MUSCLE_GROUP_KEYS,
  nameKeyOf,
  scoreMatch,
} from '@/lib/exercises';

export const dynamic = 'force-dynamic';

/**
 * The catalogue of exercises available to log — the shared seeded list plus
 * anything this user has added.
 *
 * Named exercise-library rather than living under /api/exercises because that
 * path is already the *records* directory (what you've logged, with PRs). Two
 * different questions — "what can I log" and "what have I logged" — deserve
 * two routes rather than one overloaded one.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const params = new URL(req.url).searchParams;
  const q = (params.get('q') ?? '').trim();
  // Comma-separated, because "I'm doing chest and shoulders today" is one
  // question and shouldn't cost two round trips.
  const muscles = (params.get('muscle') ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter((m) => MUSCLE_GROUP_KEYS.includes(m));

  const rows = await prisma.exercise.findMany({
    where: {
      // Shared rows plus the caller's own; never anyone else's.
      OR: [{ userId: null }, { userId: user.id }],
      ...(muscles.length ? { muscleGroup: { in: muscles } } : {}),
    },
    select: { id: true, name: true, nameKey: true, muscleGroup: true, aliases: true, userId: true },
  });

  // Ranked in memory rather than with a SQL LIKE: the catalogue is a few
  // hundred rows at most, and scoring here means prefix matches can outrank
  // substring ones — "row" should offer "Rowing machine" before "Barbell row".
  const ranked = rows
    .map((row) => ({ row, score: scoreMatch(q, row) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.row.name.localeCompare(b.row.name))
    .slice(0, 40)
    .map(({ row }) => ({
      id: row.id,
      name: row.name,
      nameKey: row.nameKey,
      muscleGroup: row.muscleGroup,
      /** True for the user's own additions, so the UI can mark them. */
      custom: row.userId !== null,
    }));

  return NextResponse.json({
    exercises: ranked,
    /** Whether what was typed already exists, so the client knows whether to
     *  offer "add this as a new exercise" without a second round trip. */
    exactMatch: q ? rows.some((r) => r.nameKey === nameKeyOf(q)) : false,
  });
}

/** Adds an exercise the catalogue doesn't have yet, owned by this user. */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as { name?: string; muscleGroup?: string };
  const name = String(body.name ?? '').trim().slice(0, 80);
  if (!name) return NextResponse.json({ error: 'Name required.' }, { status: 400 });

  const muscleGroup = MUSCLE_GROUP_KEYS.includes(String(body.muscleGroup))
    ? String(body.muscleGroup)
    : 'other';

  const nameKey = nameKeyOf(name);

  // Checked against shared rows too: adding a personal "bench press" when the
  // catalogue already has one is exactly the duplicate this feature exists to
  // prevent, so hand back the existing row instead of making a second.
  const existing = await prisma.exercise.findFirst({
    where: { nameKey, OR: [{ userId: null }, { userId: user.id }] },
  });
  if (existing) {
    return NextResponse.json({
      id: existing.id,
      name: existing.name,
      nameKey: existing.nameKey,
      muscleGroup: existing.muscleGroup,
      custom: existing.userId !== null,
      alreadyExisted: true,
    });
  }

  const created = await prisma.exercise.create({
    data: { userId: user.id, name, nameKey, muscleGroup },
  });

  return NextResponse.json(
    {
      id: created.id,
      name: created.name,
      nameKey: created.nameKey,
      muscleGroup: created.muscleGroup,
      custom: true,
      alreadyExisted: false,
    },
    { status: 201 },
  );
}
