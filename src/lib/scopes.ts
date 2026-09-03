/**
 * OAuth scopes, kept apart from src/lib/calendar.ts so a client component can
 * name one without pulling Prisma and the Google client into the browser
 * bundle. Values only — no imports, so this file is safe anywhere.
 */

/** Read/write access to calendar events. Requested on demand, never at sign-in. */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

/** What sign-in itself asks for: a name and an email address, nothing more. */
export const BASE_SCOPES = 'openid email profile';
