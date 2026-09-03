import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const body = (await req.json()) as { time?: string; title?: string };
  const data: { time?: string; title?: string } = {};

  if (body.time !== undefined) {
    const time = String(body.time).trim();
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return NextResponse.json({ error: 'time must be HH:MM' }, { status: 400 });
    }
    data.time = time;
  }
  if (body.title !== undefined) {
    const title = String(body.title).trim().slice(0, 200);
    if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
    data.title = title;
  }

  const owned = await prisma.meeting.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!owned) return NextResponse.json({ error: 'Not your meeting.' }, { status: 403 });

  return NextResponse.json(await prisma.meeting.update({ where: { id }, data }));
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  // deleteMany, not delete: an id belonging to someone else matches nothing
  // rather than deleting their row. A zero count therefore means "not yours or
  // already gone" — answering 204 there would claim a deletion that never
  // happened, and hide whatever sent the wrong id.
  const { count } = await prisma.meeting.deleteMany({ where: { id, userId: user.id } });
  if (!count) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
