import type { DefaultSession } from 'next-auth';

/**
 * Auth.js's Session type has no user id by default. The session callback in
 * src/lib/auth.ts puts one there, so the type has to say so — otherwise every
 * `session.user.id` in the codebase is an error.
 */
declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user'];
  }
}
