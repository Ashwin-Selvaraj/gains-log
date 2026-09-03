import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, forbidden } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Cheap sanity check. Google is the real validator — it won't sign in an
 *  address that doesn't exist, so this only catches typos worth catching. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return forbidden();

  // The two lists are different things and the screen shows both: an invite is
  // permission to sign in, an account is someone who actually did. An invite
  // with no account is a pending invitation.
  const [invites, users] = await Promise.all([
    prisma.allowedEmail.findMany({ orderBy: { addedAt: 'desc' } }),
    prisma.user.findMany({
      select: { id: true, email: true, name: true, image: true, isAdmin: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const accounts = new Map(users.map((u) => [u.email.toLowerCase(), u]));

  return NextResponse.json({
    me: admin.email,
    invites: invites.map((i) => {
      const account = accounts.get(i.email.toLowerCase());
      return {
        id: i.id,
        email: i.email,
        note: i.note,
        addedBy: i.addedBy,
        addedAt: i.addedAt.toISOString().slice(0, 10),
        hasAccount: Boolean(account),
        isAdmin: Boolean(account?.isAdmin),
        name: account?.name ?? null,
        image: account?.image ?? null,
      };
    }),
    /** Accounts with no matching invite — access already revoked, but the data
     *  and any live session remain. Surfaced so it isn't invisible. */
    orphans: users
      .filter((u) => !invites.some((i) => i.email.toLowerCase() === u.email.toLowerCase()))
      .map((u) => ({ id: u.id, email: u.email, name: u.name })),
  });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return forbidden();

  const body = (await req.json()) as { email?: string; note?: string };
  const email = String(body.email ?? '').trim().toLowerCase();
  const note = String(body.note ?? '').trim().slice(0, 200);

  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  const existing = await prisma.allowedEmail.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'Already invited.' }, { status: 409 });
  }

  const invite = await prisma.allowedEmail.create({
    data: { email, note, addedBy: admin.email },
  });

  return NextResponse.json(
    {
      id: invite.id,
      email: invite.email,
      note: invite.note,
      addedBy: invite.addedBy,
      addedAt: invite.addedAt.toISOString().slice(0, 10),
      hasAccount: false,
      isAdmin: false,
      name: null,
      image: null,
    },
    { status: 201 },
  );
}
