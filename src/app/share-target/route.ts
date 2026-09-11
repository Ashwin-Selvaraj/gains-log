import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Fallback for a share the service worker did not catch.
 *
 * Normally this route is never reached: the worker intercepts the POST,
 * parks the image in a cache and redirects, all without a network request.
 * But a share can arrive in the gap before the worker has activated — the
 * first launch after install, or immediately after an update — and without
 * this that POST would be a 404 dressed up as "sharing is broken".
 *
 * The file cannot be recovered here (the worker is what hands it to the page),
 * so this lands you on the snap screen ready to take one rather than
 * pretending otherwise. 303 so the browser follows with GET rather than re-posting.
 */
export async function POST(req: Request) {
  return NextResponse.redirect(new URL('/snap', req.url), 303);
}

/** Someone opening the URL directly has no share to process. */
export async function GET(req: Request) {
  return NextResponse.redirect(new URL('/', req.url), 303);
}
