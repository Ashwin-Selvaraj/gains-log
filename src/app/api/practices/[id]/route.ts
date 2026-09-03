import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';
import { logDeletion } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Rename, re-icon, archive/unarchive, or reorder a practice. */
export async function PATCH(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const body = (await req.json()) as {
    name?: string;
    icon?: string;
    archived?: boolean;
    position?: number;
  };
  const data: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: 'Name required.' }, { status: 400 });
    data.name = name;
  }
  if (body.icon !== undefined) {
    data.icon = String(body.icon).trim().slice(0, 8) || '🔥';
  }
  if (body.archived !== undefined) data.archived = Boolean(body.archived);
  if (body.position !== undefined && Number.isFinite(body.position)) {
    data.position = Math.trunc(body.position);
  }

  const { count } = await prisma.habit.updateMany({
    where: { id, userId: user.id },
    data,
  });
  if (!count) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  return NextResponse.json(await prisma.habit.findUniqueOrThrow({ where: { id } }));
}

/**
 * Deletes the practice and its whole history — unlike the built-in habits,
 * these are lightweight and user-created, so a real delete (rather than
 * archive-forever) is the right default. HabitLog cascades via the schema.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const practice = await prisma.habit.findFirst({ where: { id, userId: user.id } });
  if (!practice) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await prisma.habit.delete({ where: { id } });
  logDeletion(user.email, 'practice', `"${practice.name}" (id ${id})`);
  return new NextResponse(null, { status: 204 });
}
