import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdmin, forbidden } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) return forbidden();
  const { id } = await params;

  const invite = await prisma.allowedEmail.findUnique({ where: { id } });
  if (!invite) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // Locking yourself out of the screen that hands out access is a mistake with
  // no in-app way back — it would take a script on the server to undo.
  if (invite.email.toLowerCase() === admin.email.toLowerCase()) {
    return NextResponse.json(
      { error: 'You cannot remove your own access.' },
      { status: 400 },
    );
  }

  const owner = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { isAdmin: true },
  });
  if (owner?.isAdmin) {
    return NextResponse.json(
      { error: 'Remove their admin rights first.' },
      { status: 400 },
    );
  }

  await prisma.allowedEmail.delete({ where: { id } });

  // Their data and any session already in flight survive. With JWT sessions
  // there is no server-side session to revoke, so this stops the next sign-in
  // rather than the current one — worth saying out loud on the screen.
  return NextResponse.json({ ok: true, email: invite.email });
}

/** Grant or withdraw admin. Only ever applied to an account that exists. */
export async function PATCH(req: Request, { params }: Params) {
  const admin = await requireAdmin();
  if (!admin) return forbidden();
  const { id } = await params;

  const body = (await req.json()) as { isAdmin?: boolean };
  const isAdmin = Boolean(body.isAdmin);

  const invite = await prisma.allowedEmail.findUnique({ where: { id } });
  if (!invite) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  if (invite.email.toLowerCase() === admin.email.toLowerCase()) {
    return NextResponse.json(
      { error: 'You cannot change your own admin rights.' },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({ where: { email: invite.email } });
  if (!user) {
    return NextResponse.json(
      { error: 'They need to sign in once before they can be made an admin.' },
      { status: 400 },
    );
  }

  await prisma.user.update({ where: { id: user.id }, data: { isAdmin } });
  return NextResponse.json({ ok: true, isAdmin });
}
