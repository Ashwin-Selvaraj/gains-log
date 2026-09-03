import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureEntryId } from '@/lib/entries';
import { isDateKey } from '@/lib/date';
import { requireUser, unauthorized } from '@/lib/auth';
import {
  PHOTO_KINDS,
  missingStorageConfig,
  photoKey,
  storageConfigured,
  uploadPhoto,
  type PhotoKind,
} from '@/lib/storage';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Generous ceiling — the client downscales first, so anything near this is a bug. */
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const params = new URL(req.url).searchParams;
  const date = params.get('date');
  const kind = params.get('kind');

  const photos = await prisma.photo.findMany({
    where: {
      userId: user.id,
      ...(date && isDateKey(date) ? { entry: { date } } : {}),
      ...(kind && PHOTO_KINDS.includes(kind as PhotoKind) ? { kind } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json(photos);
}

/**
 * Uploads through the server rather than a presigned direct-to-R2 PUT.
 *
 * Direct upload would save the hop, but needs CORS configured on the bucket and
 * a second round trip to fetch the signature. The client already downscales to
 * ~1024px before sending, so what actually crosses this server is a couple of
 * hundred kilobytes — not worth the extra moving parts for one user. Swap to
 * presigned URLs if photos ever get big or frequent.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  if (!storageConfigured) {
    return NextResponse.json(
      {
        error: `Photo storage is not configured. Missing: ${missingStorageConfig().join(', ')}`,
      },
      { status: 501 },
    );
  }

  const form = await req.formData();
  const file = form.get('file');
  const date = String(form.get('date') ?? '');
  const kindRaw = String(form.get('kind') ?? 'progress');
  const caption = String(form.get('caption') ?? '').trim().slice(0, 300);

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file required' }, { status: 400 });
  }
  if (!isDateKey(date)) {
    return NextResponse.json({ error: 'valid date required' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported image type: ${file.type || 'unknown'}` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image too large (max 8 MB)' }, { status: 413 });
  }

  const kind: PhotoKind = PHOTO_KINDS.includes(kindRaw as PhotoKind)
    ? (kindRaw as PhotoKind)
    : 'progress';

  // The id is generated up front so it can name the object in the bucket, which
  // keeps the database row and the stored file trivially traceable to each other.
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  const key = photoKey(kind, user.id, id, file.type);
  const bytes = new Uint8Array(await file.arrayBuffer());

  let url: string;
  try {
    url = await uploadPhoto(key, bytes, file.type);
  } catch (err) {
    console.error('[photos] upload failed', err);

    // Pass R2's own answer through. "AccessDenied" and "NoSuchBucket" have
    // completely different fixes, and a generic "upload failed" sends you
    // checking the wrong three things first.
    const code = (err as { Code?: string; name?: string })?.Code ?? (err as Error)?.name;
    const hint =
      code === 'AccessDenied'
        ? 'R2 returned AccessDenied. The API token needs Object Read & Write, and must be scoped to this bucket (or to all buckets).'
        : code === 'NoSuchBucket'
          ? `R2 has no bucket named "${process.env.R2_BUCKET || process.env.R2_BUCKET_NAME}". Check the name.`
          : `R2 error: ${code ?? 'unknown'}.`;

    return NextResponse.json({ error: hint }, { status: 502 });
  }

  const photo = await prisma.photo.create({
    data: {
      id,
      kind,
      key,
      url,
      caption,
      bytes: file.size,
      width: Number(form.get('width')) || null,
      height: Number(form.get('height')) || null,
      mealId: (form.get('mealId') as string) || null,
      userId: user.id,
      entryId: await ensureEntryId(user.id, date),
    },
  });

  return NextResponse.json(photo, { status: 201 });
}
