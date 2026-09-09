import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';
import { logDeletion } from '@/lib/audit';
import { nameKeyOf } from '@/lib/exercises';
import {
  deletePhoto,
  exerciseImageKey,
  missingStorageConfig,
  storageConfigured,
  uploadPhoto,
} from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** The client downscales before sending, so anything approaching this is a bug. */
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

type Params = { params: Promise<{ key: string }> };

/**
 * Replaces the catalogue picture for one exercise with the person's own photo.
 *
 * Their photo, their machine — the cable crossover in your gym may look
 * nothing like the stock one, and the point of the picture is recognition. The
 * override is stored per user against the exercise key, so it never touches the
 * shared catalogue row that everyone else sees.
 */
export async function POST(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  if (!storageConfigured) {
    return NextResponse.json(
      { error: `Photo storage is not configured. Missing: ${missingStorageConfig().join(', ')}` },
      { status: 501 },
    );
  }

  const key = nameKeyOf(decodeURIComponent((await params).key));
  if (!key) return NextResponse.json({ error: 'exercise required' }, { status: 400 });

  const form = await req.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${file.type || 'unknown'}` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That image is too large.' }, { status: 413 });
  }

  const existing = await prisma.exerciseImage.findUnique({
    where: { userId_exerciseKey: { userId: user.id, exerciseKey: key } },
  });

  const storageKey = exerciseImageKey(key, file.type, user.id, crypto.randomUUID());

  // Caught rather than left to become a generic 500: the realistic failure
  // here is R2 rejecting the credentials, and "storage refused the upload" is
  // something the person reading it can act on. An uncaught throw also returns
  // an HTML error page, which the client's res.json() would choke on — turning
  // a clear failure into an unexplained one.
  let url: string;
  try {
    url = await uploadPhoto(
      storageKey,
      new Uint8Array(await file.arrayBuffer()),
      file.type,
    );
  } catch (e) {
    console.error('exercise image upload failed', e);
    return NextResponse.json(
      { error: 'Storage refused the upload. Check the R2 credentials.' },
      { status: 502 },
    );
  }

  const saved = await prisma.exerciseImage.upsert({
    where: { userId_exerciseKey: { userId: user.id, exerciseKey: key } },
    create: { userId: user.id, exerciseKey: key, url, storageKey },
    update: { url, storageKey },
  });

  // Only after the row points at the new object. Deleting first would leave
  // the exercise with a dead URL if the upload or the write then failed.
  if (existing) {
    await deletePhoto(existing.storageKey).catch(() => {});
  }

  return NextResponse.json({ exerciseKey: saved.exerciseKey, url: saved.url });
}

/** Drops the personal photo, falling back to the catalogue picture. */
export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const key = nameKeyOf(decodeURIComponent((await params).key));
  const existing = await prisma.exerciseImage.findUnique({
    where: { userId_exerciseKey: { userId: user.id, exerciseKey: key } },
  });
  if (!existing) return NextResponse.json({ ok: true });

  await prisma.exerciseImage.delete({ where: { id: existing.id } });
  await deletePhoto(existing.storageKey).catch(() => {});
  logDeletion(user.id, 'exercise image', key);

  // What it reverts to, so the client can show it without a second request.
  const catalogue = await prisma.exercise.findFirst({
    where: { nameKey: key, imageUrl: { not: '' }, OR: [{ userId: null }, { userId: user.id }] },
    orderBy: { userId: 'desc' },
    select: { imageUrl: true },
  });

  return NextResponse.json({ ok: true, url: catalogue?.imageUrl ?? '' });
}
