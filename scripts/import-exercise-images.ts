/**
 * Fills the exercise catalogue's pictures from free-exercise-db into R2.
 *
 * Run once after `npm run db:seed`, and again only when the mapping in
 * prisma/exercise-images.ts changes:
 *
 *   node --experimental-strip-types scripts/import-exercise-images.ts [--dry-run] [--force]
 *
 * Everything is validated before anything is fetched: an exercise named in the
 * map that isn't in the catalogue, or an upstream entry that has moved or lost
 * its photos, aborts the run with the list. A half-imported catalogue where
 * some lifts silently kept the wrong picture is the outcome worth avoiding.
 *
 * Idempotent. Object keys are derived from the exercise name, so a re-run
 * overwrites in place rather than accumulating orphans, and rows that already
 * carry the URL they'd be given are skipped unless --force is passed.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { EXERCISE_IMAGE_SOURCES } from '../prisma/exercise-images.ts';

// R2_* live in .env, which nothing in a bare `node` run reads for us. Parsed
// rather than depending on dotenv: the app doesn't need it, and a script
// shouldn't be the reason a package appears in the dependency tree.
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const { exerciseImageKey, uploadPhoto, storageConfigured, missingStorageConfig } =
  await import('../src/lib/storage.ts');

const DATASET =
  'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json';
const IMAGES = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

type Upstream = { name: string; images?: string[] };

const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const prisma = new PrismaClient();
const nameKeyOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

async function main() {
  if (!dryRun && !storageConfigured) {
    throw new Error(`R2 is not configured. Missing: ${missingStorageConfig().join(', ')}`);
  }

  console.log('Fetching the dataset…');
  const res = await fetch(DATASET);
  if (!res.ok) throw new Error(`Dataset fetch failed: ${res.status}`);
  const upstream = (await res.json()) as Upstream[];
  const byName = new Map(upstream.map((e) => [e.name, e]));

  const catalogue = await prisma.exercise.findMany({ where: { userId: null } });
  const byKey = new Map(catalogue.map((e) => [e.nameKey, e]));

  // ── Validate the whole map before fetching a single image ────────────────
  const problems: string[] = [];
  for (const [ours, theirs] of Object.entries(EXERCISE_IMAGE_SOURCES)) {
    if (!byKey.has(nameKeyOf(ours))) problems.push(`not in the catalogue: "${ours}"`);
    const entry = byName.get(theirs);
    if (!entry) problems.push(`gone from the dataset: "${theirs}" (for "${ours}")`);
    else if (!entry.images?.length) problems.push(`no images upstream: "${theirs}"`);
  }
  if (problems.length) {
    throw new Error(`Mapping is stale:\n  - ${problems.join('\n  - ')}`);
  }

  const unmapped = catalogue.filter((e) => !EXERCISE_IMAGE_SOURCES[e.name]);
  console.log(
    `${Object.keys(EXERCISE_IMAGE_SOURCES).length} mapped, ${unmapped.length} left ` +
      `without a picture on purpose${unmapped.length ? `: ${unmapped.map((e) => e.name).join(', ')}` : ''}`,
  );

  let uploaded = 0;
  let skipped = 0;
  let bytes = 0;

  for (const [ours, theirs] of Object.entries(EXERCISE_IMAGE_SOURCES)) {
    const row = byKey.get(nameKeyOf(ours))!;
    const key = exerciseImageKey(row.nameKey, 'image/jpeg');
    const expected = `${process.env.R2_PUBLIC_URL?.replace(/\/+$/, '')}/${key}`;

    if (!force && row.imageUrl === expected) {
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`  would upload ${ours} <- ${theirs}`);
      uploaded++;
      continue;
    }

    // Image 0 is the start of the movement; 1 is the finish. One picture is
    // what a row in a list can show, and the start position is the one you
    // need to recognise a lift you've never done.
    const img = await fetch(`${IMAGES}${byName.get(theirs)!.images![0]}`);
    if (!img.ok) throw new Error(`Image fetch failed for "${theirs}": ${img.status}`);
    const body = new Uint8Array(await img.arrayBuffer());
    bytes += body.byteLength;

    const url = await uploadPhoto(key, body, 'image/jpeg');
    await prisma.exercise.update({ where: { id: row.id }, data: { imageUrl: url } });
    uploaded++;
    console.log(`  ${ours}  ←  ${theirs}  (${Math.round(body.byteLength / 1024)} KB)`);
  }

  console.log(
    `\n${dryRun ? '[dry run] ' : ''}${uploaded} uploaded, ${skipped} already current` +
      (bytes ? `, ${(bytes / 1024 / 1024).toFixed(1)} MB transferred` : ''),
  );
}

main()
  .catch((e) => {
    console.error(`\n${e.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
