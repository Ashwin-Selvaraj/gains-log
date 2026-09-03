import { redirect } from 'next/navigation';
import { auth, signIn } from '@/lib/auth';

export const metadata = { title: 'Sign in' };

/**
 * Deliberately plain. The only decision here is "am I me", and the Google
 * button is the whole of it — a form with branding and marketing copy would be
 * noise on a private tracker.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect('/');

  const { error, callbackUrl } = await searchParams;

  return (
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-sm flex-col justify-center px-4">
      <div className="mb-8 flex items-center gap-3">
        <svg viewBox="0 0 512 512" className="h-10 w-10 shrink-0" aria-hidden>
          <rect width="512" height="512" rx="112" fill="rgb(var(--ink))" />
          <g stroke="rgb(var(--accent))" strokeLinecap="round" fill="none">
            <line x1="168" y1="344" x2="344" y2="168" strokeWidth="34" />
            <line x1="120" y1="316" x2="196" y2="392" strokeWidth="40" />
            <line x1="316" y1="120" x2="392" y2="196" strokeWidth="40" />
          </g>
        </svg>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gains Log</h1>
          <p className="text-sm text-muted">Sign in to pick up where you left off.</p>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400"
        >
          {error === 'AccessDenied'
            ? 'That account isn’t on the invite list. Ask Ashwin to add your email, then try again.'
            : 'Sign-in didn’t complete. Try once more.'}
        </p>
      )}

      <form
        action={async () => {
          'use server';
          await signIn('google', { redirectTo: callbackUrl || '/' });
        }}
      >
        <button type="submit" className="btn-quiet w-full gap-3">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z" />
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.3 14.3a7.1 7.1 0 0 1 0-4.6v-3.1h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
            <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z" />
          </svg>
          Continue with Google
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        Invite-only. Your data is visible only to you.
      </p>
    </div>
  );
}
