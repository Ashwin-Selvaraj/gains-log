'use client';

import { useState } from 'react';

/**
 * Sign out over Auth.js's own HTTP endpoint rather than a server action.
 *
 * The server-action version worked in every local test — three of them, one
 * through the real UI — and did not work on the deployed site, where clicking
 * it produced no request at all. Rather than keep guessing at what differs
 * between the two environments, this uses the plainest mechanism available:
 * a real <form> that POSTs to /api/auth/signout, which the browser submits
 * natively and whose Set-Cookie and redirect the browser applies itself. No
 * action id, no router round trip, no hydration required.
 *
 * JavaScript, when it is working, intercepts and does the same thing by fetch
 * — but fetches a fresh CSRF token first, which is the one part the no-JS path
 * cannot do for itself, and then navigates with window.location so the RSC
 * cache and every piece of client state from the signed-in session are
 * discarded rather than carried across.
 */
export function SignOutButton({
  className,
  csrfToken,
}: {
  className?: string;
  /**
   * Read from the cookie server-side, for the no-JS path. Empty is possible —
   * the cookie is only set once Auth.js has had a reason to — which is exactly
   * why the JS path fetches its own rather than trusting this.
   */
  csrfToken: string;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOutNow(e: React.MouseEvent) {
    e.preventDefault();
    setBusy(true);
    setFailed(false);

    try {
      const { csrfToken: fresh } = (await (await fetch('/api/auth/csrf')).json()) as {
        csrfToken: string;
      };
      const res = await fetch('/api/auth/signout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          csrfToken: fresh,
          callbackUrl: '/signin',
          json: 'true',
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      // Said out loud rather than silently doing nothing, which is the exact
      // failure this whole component exists to stop happening again.
      setBusy(false);
      setFailed(true);
      return;
    }

    window.location.href = '/signin';
  }

  return (
    <form action="/api/auth/signout" method="post">
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="callbackUrl" value="/signin" />
      <button type="submit" className={className} disabled={busy} onClick={signOutNow}>
        {busy ? 'Signing out…' : failed ? 'Try again' : 'Sign out'}
      </button>
    </form>
  );
}
