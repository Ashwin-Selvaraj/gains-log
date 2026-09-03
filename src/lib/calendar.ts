import { prisma } from '@/lib/prisma';
import { CALENDAR_SCOPE } from '@/lib/scopes';

/**
 * Google Calendar, for meetings you choose to push there.
 *
 * Calendar access is a separate grant from signing in. Asking for write access
 * to someone's calendar during sign-in would put a serious-looking consent
 * screen in front of everyone, including the people who only ever log squats —
 * so the scope is requested on demand from the profile screen, and sign-in
 * keeps asking for nothing but a name and an email address.
 */

/** Meetings carry no end time, so they land as a half-hour block. */
const DEFAULT_DURATION_MIN = 30;

const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

type GoogleAccount = {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  scope: string | null;
};

async function googleAccount(userId: string): Promise<GoogleAccount | null> {
  return prisma.account.findFirst({
    where: { userId, provider: 'google' },
    select: {
      id: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
      scope: true,
    },
  });
}

/** Whether this account has granted calendar access yet. */
export async function calendarConnected(userId: string): Promise<boolean> {
  const account = await googleAccount(userId);
  return Boolean(account?.scope?.includes(CALENDAR_SCOPE) && account.refresh_token);
}

export class CalendarError extends Error {
  /** True when the fix is "reconnect", not "try again". */
  readonly needsReconnect: boolean;
  constructor(message: string, needsReconnect = false) {
    super(message);
    this.needsReconnect = needsReconnect;
  }
}

/**
 * A usable access token, refreshed if the stored one has expired.
 *
 * Google's access tokens last an hour, which is shorter than the gap between
 * most sessions of an app like this — so the refresh path is the normal path,
 * not an edge case.
 */
async function accessToken(userId: string): Promise<string> {
  const account = await googleAccount(userId);
  if (!account) throw new CalendarError('No Google account linked.', true);
  if (!account.scope?.includes(CALENDAR_SCOPE)) {
    throw new CalendarError('Calendar access has not been granted.', true);
  }

  // 60s of slack, so a token that expires mid-request is refreshed first.
  const validFor = (account.expires_at ?? 0) * 1000 - Date.now();
  if (account.access_token && validFor > 60_000) return account.access_token;

  if (!account.refresh_token) {
    throw new CalendarError('Calendar access needs to be granted again.', true);
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? '',
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? '',
      grant_type: 'refresh_token',
      refresh_token: account.refresh_token,
    }),
  });

  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !body.access_token) {
    // invalid_grant means the refresh token is dead — revoked, or expired
    // through disuse. No amount of retrying fixes that; the person has to
    // grant access again.
    const dead = body.error === 'invalid_grant';
    throw new CalendarError(
      body.error_description ?? body.error ?? 'Could not refresh calendar access.',
      dead,
    );
  }

  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: body.access_token,
      expires_at: Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
    },
  });

  return body.access_token;
}

/** Local wall-clock time, handed to Google with the zone named separately. */
function timeWindow(date: string, time: string) {
  const [h, m] = time.split(':').map(Number);
  const end = new Date(Date.UTC(2000, 0, 1, h, m + DEFAULT_DURATION_MIN));
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${date}T${time}:00`,
    end: `${date}T${pad(end.getUTCHours())}:${pad(end.getUTCMinutes())}:00`,
  };
}

async function call(
  userId: string,
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const token = await accessToken(userId);
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 204) return {};

  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string; status?: string };
  };

  if (!res.ok) {
    throw new CalendarError(
      body.error?.message ?? `Calendar request failed (${res.status}).`,
      res.status === 401 || res.status === 403,
    );
  }
  return body as Record<string, unknown>;
}

type MeetingInput = { title: string; time: string; date: string; timezone: string };

export async function createEvent(userId: string, m: MeetingInput): Promise<string> {
  const { start, end } = timeWindow(m.date, m.time);
  const event = await call(userId, '', {
    method: 'POST',
    body: JSON.stringify({
      summary: m.title,
      description: 'Added from Gains Log.',
      start: { dateTime: start, timeZone: m.timezone },
      end: { dateTime: end, timeZone: m.timezone },
    }),
  });
  return String(event.id);
}

export async function updateEvent(
  userId: string,
  eventId: string,
  m: MeetingInput,
): Promise<void> {
  const { start, end } = timeWindow(m.date, m.time);
  await call(userId, `/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    body: JSON.stringify({
      summary: m.title,
      start: { dateTime: start, timeZone: m.timezone },
      end: { dateTime: end, timeZone: m.timezone },
    }),
  });
}

export async function deleteEvent(userId: string, eventId: string): Promise<void> {
  try {
    await call(userId, `/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  } catch (err) {
    // Already gone on Google's side is the outcome we wanted anyway. Deleting
    // it by hand in Calendar shouldn't make deleting it here fail.
    const message = err instanceof Error ? err.message : '';
    if (!/not found|deleted/i.test(message)) throw err;
  }
}
