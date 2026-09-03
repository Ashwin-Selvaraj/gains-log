import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * Gate for *pages*. API routes check the session themselves with requireUser()
 * so they can answer 401 in JSON rather than redirect a fetch into an HTML
 * login page, which is a uniquely confusing thing to debug.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    pathname.startsWith('/signin') ||
    pathname.startsWith('/api/auth') ||
    // The service worker and manifest must stay reachable when signed out, or
    // an installed PWA cannot even load its own shell to show the login page.
    pathname === '/sw.js' ||
    pathname === '/manifest.webmanifest';

  if (isPublic || req.auth) return NextResponse.next();

  // API routes get a 401 instead of a redirect; a fetch that follows a 302 to
  // an HTML page produces a JSON parse error miles from the actual cause.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }

  const url = new URL('/signin', req.nextUrl.origin);
  url.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(url);
});

export const config = {
  // Static assets and icons are excluded so the sign-in page can render itself.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.*|apple-touch-icon.*).*)'],
};
