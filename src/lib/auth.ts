import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureUserDefaults } from '@/lib/bootstrap';

/**
 * Google sign-in, invite-only.
 *
 * Session strategy is JWT rather than database. Database sessions would add an
 * indexed lookup to *every* API call, and this app's endpoints were tuned down
 * to roughly a single round trip — paying another one on each request would
 * undo a meaningful part of that. The cost is that removing someone from the
 * allowlist blocks new sign-ins but does not kill a session already in flight;
 * with a handful of invited people that is an acceptable trade. Shortening
 * `maxAge` narrows the window.
 */

/** Bootstrap allowlist, so the first sign-in isn't a chicken-and-egg problem. */
function envAllowed(): string[] {
  return (process.env.AUTH_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function isAllowed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const normalised = email.trim().toLowerCase();

  if (envAllowed().includes(normalised)) return true;
  return Boolean(
    await prisma.allowedEmail.findUnique({ where: { email: normalised } }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      /**
       * Links a Google sign-in to an existing User row that has the same
       * email but no Account yet. Two cases need it: the migration that
       * created the first User from the pre-auth data (scripts/backfill-owner.mjs),
       * and any account pre-created for an invitee.
       *
       * Auth.js calls this "dangerous" because with a provider that does not
       * verify email ownership, anyone who claims an address could take over
       * the matching account. Google does verify it, so the risk it warns
       * about does not apply here. Do not copy this onto a provider that
       * hands back unverified addresses.
       */
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },

  /**
   * Required when self-hosting behind a reverse proxy. The app runs on
   * localhost inside the server and Caddy terminates TLS in front of it, so
   * the Host header Auth.js sees is one it did not set for itself; without
   * this it rejects every request with UntrustedHost and nobody can sign in.
   *
   * The header is only as trustworthy as whatever can reach the app. Caddy is
   * the sole route in — the port is not exposed past the firewall — so it is
   * trustworthy here. Set AUTH_URL in production as well, so callback URLs are
   * built from the real domain rather than from the header.
   */
  trustHost: true,
  pages: { signIn: '/signin', error: '/signin' },

  events: {
    /**
     * Fires once, when the adapter first writes the User row. Gives the new
     * account a plan, presets and settings so they land on a working app
     * instead of five empty screens.
     *
     * An event rather than a callback: it must not be able to fail the
     * sign-in. If this throws, the person is still signed in and simply has an
     * empty plan they can fill in themselves — which is a far better outcome
     * than being unable to get in at all.
     */
    async createUser({ user }) {
      if (!user.id) return;
      try {
        await ensureUserDefaults(user.id);
      } catch (err) {
        console.error('[auth] could not seed defaults for new user:', err);
      }
    },
  },

  callbacks: {
    /** The door. An address not on the list never gets a User row at all. */
    async signIn({ user }) {
      return await isAllowed(user.email);
    },

    async jwt({ token, user }) {
      // `user` is only present on the sign-in pass; afterwards the id rides in
      // the token, which is what avoids a per-request database lookup.
      if (user?.id) token.uid = user.id;
      return token;
    },

    async session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
});

/* ── Route helpers ────────────────────────────────────────────────────────
   Every API route starts with requireUser(). Returning null rather than
   throwing keeps the 401 an ordinary early return, so a route that forgets the
   check fails to compile against the scoped queries rather than silently
   serving someone else's data. */

export type SessionUser = { id: string; email: string; name?: string | null };

export async function requireUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return { id: user.id, email: user.email, name: user.name };
}

export function unauthorized() {
  return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
}
