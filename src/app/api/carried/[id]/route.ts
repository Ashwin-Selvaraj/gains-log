import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';
import { logDeletion } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  // findFirst with the owner in the filter: delete({ where: { id } }) would
  // happily remove another user's row if an id ever leaked, and this is also
  // what lets the log line below say what was actually removed.
  const carried = await prisma.carriedExercise.findFirst({ where: { id, userId: user.id } });
  if (!carried) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await prisma.carriedExercise.delete({ where: { id } });
  logDeletion(user.email, 'carried exercise', `${carried.name} (id ${id})`);
  return new NextResponse(null, { status: 204 });
}
