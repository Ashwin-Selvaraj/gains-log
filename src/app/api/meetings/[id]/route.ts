import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';
import { readSettings } from '@/lib/settings';
import { CalendarError, createEvent, deleteEvent, updateEvent } from '@/lib/calendar';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Turns a thrown CalendarError into something worth showing on a phone. */
function explain(err: unknown): string {
  if (err instanceof CalendarError) {
    return err.needsReconnect ? 'Reconnect Google Calendar in your profile.' : err.message;
  }
  return 'Could not reach Google Calendar.';
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const body = (await req.json()) as {
    time?: string;
    title?: string;
    addToCalendar?: boolean;
  };
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

  const existing = await prisma.meeting.findFirst({
    where: { id, userId: user.id },
    include: { entry: { select: { date: true } } },
  });
  if (!existing) return NextResponse.json({ error: 'Not your meeting.' }, { status: 403 });

  let meeting = await prisma.meeting.update({ where: { id }, data });

  const wanted = body.addToCalendar;
  const on = Boolean(existing.calendarEventId);
  const details = {
    title: meeting.title,
    time: meeting.time,
    date: existing.entry.date,
    timezone: (await readSettings(user.id)).timezone,
  };

  try {
    if (wanted === true && !on) {
      const eventId = await createEvent(user.id, details);
      meeting = await prisma.meeting.update({
        where: { id },
        data: { calendarEventId: eventId, calendarError: null },
      });
    } else if (wanted === false && on) {
      await deleteEvent(user.id, existing.calendarEventId!);
      meeting = await prisma.meeting.update({
        where: { id },
        data: { calendarEventId: null, calendarError: null },
      });
    } else if (on && (data.time || data.title)) {
      // Already synced and the details changed — the event has to follow, or
      // the calendar quietly keeps showing the old time.
      await updateEvent(user.id, existing.calendarEventId!, details);
      meeting = await prisma.meeting.update({
        where: { id },
        data: { calendarError: null },
      });
    }
  } catch (err) {
    meeting = await prisma.meeting.update({
      where: { id },
      data: { calendarError: explain(err) },
    });
  }

  return NextResponse.json(meeting);
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;

  const meeting = await prisma.meeting.findFirst({ where: { id, userId: user.id } });
  if (!meeting) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // Best effort: an event left behind on the calendar is worth a warning in the
  // log, but not worth refusing to delete the meeting here.
  if (meeting.calendarEventId) {
    try {
      await deleteEvent(user.id, meeting.calendarEventId);
    } catch (err) {
      console.warn('[meetings] calendar event not removed', err);
    }
  }

  await prisma.meeting.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
