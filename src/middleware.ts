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

  if (isPublic) return NextResponse.next();

  if (req.auth) {
    /**
     * Bounce non-admins away from /admin before anything renders. Without this
     * the layout's own check still protects the screen, but only after Next has
     * streamed the loading skeleton — so a non-admin saw an "Manage access"
     * shell flash past on the way out, and the response was a 200.
     *
     * This reads the flag from the signed token, which can be stale by design
     * (see the jwt callback). It is a routing convenience, not the security
     * boundary: requireAdmin() in the layout and in every /api/admin route
     * re-reads the database, and those are what actually decide.
     */
    if (pathname.startsWith('/admin') && !req.auth.user?.isAdmin) {
      return NextResponse.redirect(new URL('/', req.nextUrl.origin));
    }
    return NextResponse.next();
  }

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
  /**
   * Anything with a static file extension is excluded, not just a handful of
   * icon names. The previous list named favicon and icon* only, so every other
   * file in public/ — the sign-in artwork included — was answered with a 307 to
   * /signin instead of the file, which is a confusing way for an image to fail:
   * the request succeeds, and you are left inspecting CSS opacity.
   *
   * Nothing served from public/ is private. Photos live in R2 behind their own
   * URLs, so this exposes app assets only.
   */
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|webp|avif|gif|svg|ico|webmanifest|json|txt|xml|js|css)).*)',
  ],
};
