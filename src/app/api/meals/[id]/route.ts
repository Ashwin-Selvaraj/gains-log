import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await prisma.mealEntry.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
