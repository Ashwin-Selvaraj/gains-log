'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Invite = {
  id: string;
  email: string;
  note: string;
  addedBy: string;
  addedAt: string;
  hasAccount: boolean;
  isAdmin: boolean;
  name: string | null;
  image: string | null;
};

type Data = {
  me: string;
  invites: Invite[];
  orphans: { id: string; email: string; name: string | null }[];
};

export default function AdminPage() {
  const [data, setData] = useState<Data | null>(null);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    const res = await fetch('/api/admin/invites');
    if (!res.ok) {
      setError('Could not load the invite list.');
      return;
    }
    setData(await res.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, note }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? 'Could not add them.');
        return;
      }
      setEmail('');
      setNote('');
      setNotice(`${body.email} can now sign in with Google.`);
      await load();
    } catch {
      setError('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(inv: Invite) {
    if (!confirm(`Remove access for ${inv.email}?\n\nTheir logged data is kept.`)) return;
    const res = await fetch(`/api/admin/invites/${inv.id}`, { method: 'DELETE' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? 'Could not remove them.');
      return;
    }
    setNotice(`${inv.email} can no longer sign in.`);
    await load();
  }

  async function setAdmin(inv: Invite, isAdmin: boolean) {
    const res = await fetch(`/api/admin/invites/${inv.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isAdmin }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? 'Could not change their rights.');
      return;
    }
    setNotice(
      isAdmin
        ? `${inv.email} is now an admin — they will see it after signing in again.`
        : `${inv.email} is no longer an admin.`,
    );
    await load();
  }

  return (
    <div className="space-y-4 pb-4">
      <header className="pt-1">
        <h1 className="text-2xl font-bold tracking-tight">Manage access</h1>
        <p className="text-sm text-muted">
          Gains Log is invite-only. Only the addresses below can sign in.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm text-accent">{notice}</p>
      )}

      {/* ── Invite ───────────────────────────────────────────────────────── */}
      <form onSubmit={invite} className="card space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Invite someone
        </h2>
        <div>
          <label className="label" htmlFor="email">
            Google account email
          </label>
          <input
            id="email"
            className="field"
            type="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="them@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <p className="mt-1.5 text-xs text-muted">
            It has to be the address on their Google account — that is what they will
            sign in with.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="note">
            Note <span className="font-normal">(optional)</span>
          </label>
          <input
            id="note"
            className="field"
            placeholder="Gym partner"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <button className="btn-primary w-full" disabled={busy || !email}>
          {busy ? 'Adding…' : 'Add to invite list'}
        </button>
      </form>

      {/* ── The list ─────────────────────────────────────────────────────── */}
      <section className="card space-y-1">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted">
          Invited ({data?.invites.length ?? 0})
        </h2>

        {!data && <p className="py-4 text-sm text-muted">Loading…</p>}

        {data?.invites.map((inv) => {
          const isMe = inv.email.toLowerCase() === data.me.toLowerCase();
          return (
            <div
              key={inv.id}
              className="flex items-center gap-3 border-b border-line py-3 last:border-0"
            >
              {inv.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={inv.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-sm font-semibold text-muted ring-1 ring-line">
                  {inv.email[0]?.toUpperCase()}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {inv.name ?? inv.email}
                  {isMe && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {inv.name ? `${inv.email} · ` : ''}
                  {inv.hasAccount ? 'Signed in' : 'Not signed in yet'}
                  {inv.note && ` · ${inv.note}`}
                </p>
              </div>

              {inv.isAdmin && (
                <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-accent">
                  Admin
                </span>
              )}

              {!isMe && (
                <details className="relative shrink-0">
                  <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-muted transition-colors hover:bg-line/50 [&::-webkit-details-marker]:hidden">
                    <span aria-hidden>⋯</span>
                    <span className="sr-only">Actions for {inv.email}</span>
                  </summary>
                  <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-line bg-card shadow-lg">
                    {inv.hasAccount && (
                      <button
                        className="w-full px-3 py-2.5 text-left text-sm transition-colors hover:bg-line/40"
                        onClick={() => void setAdmin(inv, !inv.isAdmin)}
                      >
                        {inv.isAdmin ? 'Remove admin' : 'Make admin'}
                      </button>
                    )}
                    <button
                      className="w-full px-3 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-500/10 dark:text-red-400"
                      onClick={() => void revoke(inv)}
                    >
                      Remove access
                    </button>
                  </div>
                </details>
              )}
            </div>
          );
        })}

        {data?.invites.length === 0 && (
          <p className="py-4 text-sm text-muted">Nobody yet.</p>
        )}
      </section>

      {data && data.orphans.length > 0 && (
        <section className="card">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            Accounts without an invite
          </h2>
          <p className="mt-2 text-sm text-muted">
            These accounts were removed from the list but their data is still here.
          </p>
          <ul className="mt-2 space-y-1">
            {data.orphans.map((o) => (
              <li key={o.id} className="truncate text-sm">
                {o.email}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Honest about what removal does and does not do. */}
      <p className="px-1 text-xs leading-relaxed text-muted">
        Removing someone blocks their next sign-in. A session already open stays valid
        until it expires, and their logged data is kept either way.
      </p>

      <Link href="/profile" className="btn-quiet w-full">
        Back to profile
      </Link>
    </div>
  );
}
