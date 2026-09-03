import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';
import { logDeletion } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function PATCH(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const body = (await req.json()) as { time?: string; label?: string; enabled?: boolean };
  const data: { time?: string; label?: string; enabled?: boolean } = {};

  if (body.time !== undefined) {
    const time = String(body.time).trim();
    if (!TIME.test(time)) {
      return NextResponse.json({ error: 'Time must be HH:MM.' }, { status: 400 });
    }
    data.time = time;
  }
  if (body.label !== undefined) data.label = String(body.label).trim().slice(0, 80);
  if (body.enabled !== undefined) data.enabled = Boolean(body.enabled);

  const owned = await prisma.reminder.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  try {
    return NextResponse.json(await prisma.reminder.update({ where: { id }, data }));
  } catch {
    // The only constraint here is [userId, time]; anything else would have
    // failed validation above.
    return NextResponse.json(
      { error: 'You already have a reminder at that time.' },
      { status: 409 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const reminder = await prisma.reminder.findFirst({ where: { id, userId: user.id } });
  if (!reminder) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await prisma.reminder.delete({ where: { id } });
  logDeletion(user.email, 'reminder', `${reminder.time} "${reminder.label}" (id ${id})`);
  return new NextResponse(null, { status: 204 });
}
