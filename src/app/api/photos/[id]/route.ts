import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deletePhoto } from '@/lib/storage';
import { requireUser, unauthorized } from '@/lib/auth';
import { logDeletion } from '@/lib/audit';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  // findFirst scoped by owner, so another account's id simply does not resolve.
  const photo = await prisma.photo.findFirst({ where: { id, userId: user.id } });
  if (!photo) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  // The row goes regardless. An object left behind in the bucket is a few
  // kilobytes of waste; a row pointing at a deleted object is a broken image
  // in the UI, which is worse.
  try {
    await deletePhoto(photo.key);
  } catch (err) {
    console.warn('[photos] bucket delete failed, removing row anyway', err);
  }

  // Ownership is already established above, so a plain delete is safe here.
  await prisma.photo.delete({ where: { id } });
  logDeletion(user.email, 'photo', `${photo.kind} ${photo.key} (id ${id})`);
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const body = (await req.json()) as { caption?: string };
  return NextResponse.json(
    await prisma.photo.updateMany({
      where: { id, userId: user.id },
      data: { caption: String(body.caption ?? '').trim().slice(0, 300) },
    }),
  );
}
