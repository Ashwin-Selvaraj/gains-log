import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  // deleteMany with the owner in the filter: delete({ where: { id } }) would
  // happily remove another user's row if an id ever leaked.
  // deleteMany, not delete: an id belonging to someone else matches nothing
  // rather than deleting their row. A zero count therefore means "not yours or
  // already gone" — answering 204 there would claim a deletion that never
  // happened, and hide whatever sent the wrong id.
  const { count } = await prisma.carriedExercise.deleteMany({ where: { id, userId: user.id } });
  if (!count) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
