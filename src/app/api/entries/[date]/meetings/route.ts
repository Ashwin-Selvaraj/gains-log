import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureEntryId } from '@/lib/entries';
import { isDateKey } from '@/lib/date';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ date: string }> };

export async function POST(req: Request, { params }: Params) {
  const { date } = await params;
  if (!isDateKey(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 });

  const body = (await req.json()) as { time?: string; title?: string };
  const time = String(body.time ?? '').trim();
  const title = String(body.title ?? '').trim().slice(0, 200);

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'time must be HH:MM' }, { status: 400 });
  }
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const meeting = await prisma.meeting.create({
    data: { time, title, entryId: await ensureEntryId(date) },
  });
  return NextResponse.json(meeting, { status: 201 });
}
