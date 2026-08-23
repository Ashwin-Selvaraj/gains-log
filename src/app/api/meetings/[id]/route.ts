import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
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

  return NextResponse.json(await prisma.meeting.update({ where: { id }, data }));
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await prisma.meeting.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
