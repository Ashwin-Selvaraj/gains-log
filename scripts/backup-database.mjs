/**
 * Nightly database backup, run by systemd (see gains-log-backup.timer).
 *
 * Written the day self-hosted Postgres replaced Neon. Neon backed itself up
 * automatically and invisibly; a Postgres server on this same box backs up
 * nothing on its own. Storing the dump anywhere on this box would defeat the
 * point — a disk problem here would take the database and its backup down
 * together — so this uploads to R2 instead, reusing the same bucket and
 * credentials the app already has for photos, under a separate prefix.
 *
 *   node scripts/backup-database.mjs
 *
 * Exits non-zero on any failure, so a cron/systemd failure is visible as a
 * failed unit rather than a silently-empty backup folder.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const run = promisify(execFile);
const root = new URL('..', import.meta.url).pathname;

// Minimal .env reader — mirrors scripts/set-db-provider.mjs. This runs
// standalone via systemd, not through Next.js, so nothing else loads .env.
function envFromFile(name) {
  const file = join(root, name);
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

const env = { ...envFromFile('.env'), ...process.env };

const DATABASE_URL = env.DATABASE_URL;
const ACCOUNT_ID = env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = env.R2_SECRET_ACCESS_KEY;
const BUCKET = env.R2_BUCKET || env.R2_BUCKET_NAME || 'gains';
/** Backups live in their own prefix — never confused with a photo listing. */
const PREFIX = 'db-backups/';
/** Nightly for this long is roomy for a single-user database in the tens of MB. */
const RETENTION_DAYS = 14;

if (!DATABASE_URL?.startsWith('postgres')) {
  console.error('DATABASE_URL is not a Postgres URL — nothing to back up.');
  process.exit(1);
}
if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY) {
  console.error('R2 credentials are not set — see R2_* in .env.example.');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY },
});

async function main() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const dir = await mkdtemp(join(tmpdir(), 'gains-backup-'));
  const dumpPath = join(dir, `gainslog-${stamp}.dump`);

  try {
    console.log(`Dumping database to ${dumpPath} …`);
    // -Fc: Postgres's own compressed, seekable format — restorable with
    // pg_restore, and selectively (one table at a time) if ever needed, unlike
    // a plain .sql dump.
    await run('pg_dump', [DATABASE_URL, '-Fc', '-f', dumpPath]);

    const body = await readFile(dumpPath);
    const key = `${PREFIX}gainslog-${stamp}.dump`;
    console.log(`Uploading ${(body.length / 1024).toFixed(0)} KB to r2://${BUCKET}/${key} …`);
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: body,
        ContentType: 'application/octet-stream',
      }),
    );
    console.log('Backup uploaded.');

    await pruneOldBackups();
    console.log('Done.');
  } finally {
    // Always, whether the run succeeded or failed — nothing sensitive should
    // linger in /tmp on a box other people occasionally SSH into.
    await rm(dir, { recursive: true, force: true });
  }
}

/** Deletes anything under the backup prefix older than RETENTION_DAYS. */
async function pruneOldBackups() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const listing = await s3.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX }),
  );
  const stale = (listing.Contents ?? []).filter(
    (obj) => obj.LastModified && obj.LastModified.getTime() < cutoff,
  );
  for (const obj of stale) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: obj.Key }));
    console.log(`Pruned old backup: ${obj.Key}`);
  }
}

main().catch((err) => {
  console.error('Backup failed:', err.message ?? err);
  process.exit(1);
});
