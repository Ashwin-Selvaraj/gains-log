import Link from 'next/link';
import { auth, signOut } from '@/lib/auth';
import { Menu } from '@/components/Menu';

/**
 * Who you're signed in as, plus the way out.
 *
 * A server component so the session is read without shipping it to the client;
 * the interactive shell around it is Menu, which handles opening, closing on a
 * choice, closing on an outside click and closing on Escape.
 */
export async function AccountMenu() {
  const session = await auth();
  const user = session?.user;
  if (!user?.email) return null;

  const label = user.name?.trim() || user.email;
  const initial = label[0]?.toUpperCase() ?? '?';

  const item =
    'block w-full px-3 py-2.5 text-left text-sm text-ink transition-colors hover:bg-line/40';

  return (
    <Menu
      label={`Signed in as ${label}`}
      trigger={
        <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-card text-xs font-semibold text-muted ring-1 ring-line transition-colors hover:text-ink">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- Google's avatar
            // CDN would need a next.config remote pattern for a 32px image.
            <img src={user.image} alt="" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            initial
          )}
        </span>
      }
    >
      <p className="truncate border-b border-line px-3 py-2.5 text-xs text-muted" title={user.email}>
        {user.email}
      </p>

      <Link href="/profile" className={item}>
        Profile
      </Link>
      <Link href="/goals" className={item}>
        Goals &amp; targets
      </Link>
      {user.isAdmin && (
        <Link href="/admin" className={item}>
          Manage access
        </Link>
      )}

      <div className="border-t border-line" />

      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/signin' });
        }}
      >
        <button type="submit" className={item}>
          Sign out
        </button>
      </form>
    </Menu>
  );
}
