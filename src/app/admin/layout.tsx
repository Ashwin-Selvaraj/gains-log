import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';

export const metadata = { title: 'Manage access' };

/**
 * Gate in the layout, not the page.
 *
 * A layout wraps every route under /admin, so anything added here later is
 * protected by construction rather than by remembering to repeat the check.
 * requireAdmin re-reads the flag from the database, so revoking admin takes
 * effect on the next request instead of when the session eventually expires.
 * The API routes check independently — this only decides what is rendered.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  // Not "forbidden": someone who isn't an admin has no reason to learn that
  // this screen exists.
  if (!admin) redirect('/');
  return children;
}
