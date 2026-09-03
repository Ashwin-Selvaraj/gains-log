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

/**
 * The invite list lives only in the database. It used to also read an
 * AUTH_ALLOWED_EMAILS env var, which meant inviting someone was an ssh session,
 * a file edit and a restart — and the list silently differed between a laptop
 * and the server. Admins now manage it at /admin, and the first admin is
 * granted by scripts/grant-admin.mjs.
 */
export async function isAllowed(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  return Boolean(
    await prisma.allowedEmail.findUnique({
      where: { email: email.trim().toLowerCase() },
    }),
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

    async jwt({ token, user, trigger }) {
      // `user` is only present on the sign-in pass; afterwards the id rides in
      // the token, which is what avoids a per-request database lookup.
      if (user?.id) token.uid = user.id;

      // Admin is read on sign-in and whenever the session is explicitly
      // updated, not on every request — the whole point of the JWT strategy is
      // that an ordinary request touches no table. Someone granted admin sees
      // it after their next sign-in, which for a list that changes rarely is
      // the right trade.
      if (user?.id || trigger === 'update') {
        const id = (user?.id ?? token.uid) as string | undefined;
        if (id) {
          const row = await prisma.user.findUnique({
            where: { id },
            select: { isAdmin: true },
          });
          token.isAdmin = row?.isAdmin ?? false;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = token.uid as string;
        session.user.isAdmin = Boolean(token.isAdmin);
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

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  isAdmin: boolean;
};

export async function requireUser(): Promise<SessionUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isAdmin: Boolean(user.isAdmin),
  };
}

/**
 * Admin routes re-read the flag from the database rather than trusting the
 * token. The token is signed and cannot be forged, but it can be stale: an
 * admin whose access was revoked would keep it until their session expired.
 * For the one screen that hands out access to the whole app, a lookup per
 * request is worth it.
 */
export async function requireAdmin(): Promise<SessionUser | null> {
  const user = await requireUser();
  if (!user) return null;
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { isAdmin: true },
  });
  return row?.isAdmin ? { ...user, isAdmin: true } : null;
}

export function forbidden() {
  return NextResponse.json({ error: 'Admins only.' }, { status: 403 });
}

export function unauthorized() {
  return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
}
