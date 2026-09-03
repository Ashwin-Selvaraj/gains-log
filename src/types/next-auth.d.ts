import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      /** Grants the /admin screen. Mirrors User.isAdmin, refreshed on sign-in. */
      isAdmin?: boolean;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    uid?: string;
    isAdmin?: boolean;
  }
}
