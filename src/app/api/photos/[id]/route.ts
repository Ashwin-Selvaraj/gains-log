import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deletePhoto } from '@/lib/storage';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const photo = await prisma.photo.findUnique({ where: { id } });
  if (!photo) return new NextResponse(null, { status: 204 });

  // The row goes regardless. An object left behind in the bucket is a few
  // kilobytes of waste; a row pointing at a deleted object is a broken image
  // in the UI, which is worse.
  try {
    await deletePhoto(photo.key);
  } catch (err) {
    console.warn('[photos] bucket delete failed, removing row anyway', err);
  }

  await prisma.photo.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(req: Request, { params }: Params) {
  const { id } = await params;
  const body = (await req.json()) as { caption?: string };
  return NextResponse.json(
    await prisma.photo.update({
      where: { id },
      data: { caption: String(body.caption ?? '').trim().slice(0, 300) },
    }),
  );
}
