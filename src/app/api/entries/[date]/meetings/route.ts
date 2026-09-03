import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureEntryId } from '@/lib/entries';
import { isDateKey } from '@/lib/date';
import { requireUser, unauthorized } from '@/lib/auth';
import { readSettings } from '@/lib/settings';
import { CalendarError, createEvent } from '@/lib/calendar';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ date: string }> };

export async function POST(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { date } = await params;
  if (!isDateKey(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 });

  const body = (await req.json()) as {
    time?: string;
    title?: string;
    addToCalendar?: boolean;
  };
  const time = String(body.time ?? '').trim();
  const title = String(body.title ?? '').trim().slice(0, 200);

  if (!/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: 'time must be HH:MM' }, { status: 400 });
  }
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  const meeting = await prisma.meeting.create({
    data: { time, title, userId: user.id, entryId: await ensureEntryId(user.id, date) },
  });

  if (!body.addToCalendar) return NextResponse.json(meeting, { status: 201 });

  // The meeting is saved before the calendar is touched, and a calendar failure
  // does not fail the request. Losing what you just typed because Google was
  // briefly unreachable would be a much worse outcome than a meeting that is
  // saved here but not yet on your calendar — which the row records, and the UI
  // shows, so it can be retried.
  const settings = await readSettings(user.id);
  try {
    const eventId = await createEvent(user.id, {
      title,
      time,
      date,
      timezone: settings.timezone,
    });
    return NextResponse.json(
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { calendarEventId: eventId, calendarError: null },
      }),
      { status: 201 },
    );
  } catch (err) {
    const message =
      err instanceof CalendarError
        ? err.needsReconnect
          ? 'Reconnect Google Calendar in your profile.'
          : err.message
        : 'Could not reach Google Calendar.';
    return NextResponse.json(
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { calendarError: message },
      }),
      { status: 201 },
    );
  }
}
