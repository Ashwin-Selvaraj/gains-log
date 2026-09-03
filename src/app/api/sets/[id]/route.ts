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
  // findFirst rather than deleting blind, so the log line below says what was
  // actually removed instead of just an id.
  const set = await prisma.workoutSet.findFirst({ where: { id, userId: user.id } });
  if (!set) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await prisma.workoutSet.delete({ where: { id } });
  logDeletion(
    user.email,
    'set',
    `${set.exercise} ${set.weightKg ?? 'bw'}×${set.reps} (id ${id})`,
  );
  return new NextResponse(null, { status: 204 });
}
