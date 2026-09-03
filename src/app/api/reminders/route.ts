import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Enough reminders to cover a day without becoming a nuisance to itself. */
const MAX_REMINDERS = 8;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  return NextResponse.json(
    await prisma.reminder.findMany({
      where: { userId: user.id },
      orderBy: { time: 'asc' },
    }),
  );
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as { time?: string; label?: string };
  const time = String(body.time ?? '').trim();
  const label = String(body.label ?? '').trim().slice(0, 80);

  // "HH:MM", zero-padded — the same shape the scheduler parses and the same
  // shape an <input type="time"> produces.
  if (!TIME.test(time)) {
    return NextResponse.json({ error: 'Time must be HH:MM.' }, { status: 400 });
  }

  if ((await prisma.reminder.count({ where: { userId: user.id } })) >= MAX_REMINDERS) {
    return NextResponse.json(
      { error: `That's the limit of ${MAX_REMINDERS} reminders.` },
      { status: 400 },
    );
  }

  const clash = await prisma.reminder.findUnique({
    where: { userId_time: { userId: user.id, time } },
  });
  if (clash) {
    return NextResponse.json(
      { error: 'You already have a reminder at that time.' },
      { status: 409 },
    );
  }

  return NextResponse.json(
    await prisma.reminder.create({ data: { userId: user.id, time, label } }),
    { status: 201 },
  );
}
