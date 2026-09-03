import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/**
 * Cloudflare R2 — S3-compatible, so the AWS SDK talks to it directly.
 *
 * Photos go to object storage rather than into Postgres. Food photos used to
 * be stored as base64 data URLs on the meal row, which meant a month of them
 * turned every history fetch into a multi-megabyte download. R2's free tier is
 * 10 GB with no egress charge, which is thousands of photos for this app.
 */

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
/**
 * Both spellings are accepted. Cloudflare's own docs and dashboard use
 * "bucket name", so R2_BUCKET_NAME is the natural thing to write in a .env —
 * and silently falling back to a default while ignoring the variable you did
 * set would target the wrong bucket without ever saying so.
 */
const BUCKET = process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || 'gains';
/** Public base URL — the r2.dev subdomain, or a custom domain on the bucket. */
const PUBLIC_URL = process.env.R2_PUBLIC_URL?.replace(/\/+$/, '');

export const storageConfigured = Boolean(
  ACCOUNT_ID && ACCESS_KEY_ID && SECRET_ACCESS_KEY && PUBLIC_URL,
);

/** What the photo is of. Also the top-level folder in the bucket. */
export const PHOTO_KINDS = ['progress', 'meal', 'other'] as const;
export type PhotoKind = (typeof PHOTO_KINDS)[number];

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!storageConfigured) {
    throw new Error('R2 is not configured — see R2_* variables in .env.example');
  }
  client ??= new S3Client({
    region: 'auto', // R2 has no regions; the endpoint carries the account.
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ACCESS_KEY_ID!,
      secretAccessKey: SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Object key for a photo, e.g. `progress/<userId>/2026/09/clx123abc.jpg`.
 *
 * Foldered by kind, then owner, then year/month: the bucket stays browsable as
 * it grows, a lifecycle rule can expire old months, and one person's photos can
 * be listed or purged as a group when they leave. The id is a cuid rather
 * than the original filename: filenames from a phone camera collide constantly
 * (IMG_0001.jpg) and can carry characters that need escaping.
 */
export function photoKey(
  kind: PhotoKind,
  userId: string,
  id: string,
  contentType: string,
): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const ext = EXTENSIONS[contentType] ?? 'jpg';
  return `${kind}/${userId}/${year}/${month}/${id}.${ext}`;
}

export async function uploadPhoto(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Immutable: the key contains a unique id, so a given key's bytes never
      // change. Lets the browser and Cloudflare cache it indefinitely.
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
  return `${PUBLIC_URL}/${key}`;
}

export async function deletePhoto(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

/** Which settings are missing, for a useful error rather than a generic failure. */
export function missingStorageConfig(): string[] {
  return [
    ['R2_ACCOUNT_ID', ACCOUNT_ID],
    ['R2_ACCESS_KEY_ID', ACCESS_KEY_ID],
    ['R2_SECRET_ACCESS_KEY', SECRET_ACCESS_KEY],
    ['R2_PUBLIC_URL', PUBLIC_URL],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k as string);
}
