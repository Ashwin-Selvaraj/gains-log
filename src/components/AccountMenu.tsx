import { auth, signOut } from '@/lib/auth';

/**
 * Who you're signed in as, plus the way out.
 *
 * A <details> rather than a client component with state: the whole thing is one
 * toggle and one form, so hydrating JavaScript to open a menu would be cost with
 * no return — and it keeps working before hydration, which on a phone opening a
 * cold PWA is a real moment rather than a hypothetical one.
 */
export async function AccountMenu() {
  const session = await auth();
  const user = session?.user;
  if (!user?.email) return null;

  const label = user.name?.trim() || user.email;
  const initial = label[0]?.toUpperCase() ?? '?';

  return (
    <details className="group relative">
      <summary
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full bg-card text-xs font-semibold text-muted ring-1 ring-line transition-colors hover:text-ink [&::-webkit-details-marker]:hidden"
        aria-label={`Signed in as ${label}`}
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- Google's avatar
          // CDN host would need a next.config remote pattern for a 32px image.
          <img src={user.image} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : (
          initial
        )}
      </summary>

      <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-line bg-card shadow-lg">
        <p className="truncate border-b border-line px-3 py-2.5 text-xs text-muted" title={user.email}>
          {user.email}
        </p>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/signin' });
          }}
        >
          <button
            type="submit"
            className="w-full px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-line/40"
          >
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
