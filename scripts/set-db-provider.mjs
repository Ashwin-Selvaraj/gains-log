// Keeps prisma/schema.prisma's datasource provider in sync with DATABASE_URL.
//
// Local dev defaults to SQLite (file:./dev.db) so `npm run dev` works with zero
// setup. Point DATABASE_URL at a postgres:// URL (Neon, Supabase, Vercel Postgres)
// and this flips the provider to postgresql on the next generate/build.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const schemaPath = join(root, 'prisma', 'schema.prisma');

// Minimal .env reader — this runs before Next.js loads env files.
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

const url =
  process.env.DATABASE_URL ||
  envFromFile('.env.local').DATABASE_URL ||
  envFromFile('.env').DATABASE_URL ||
  'file:./dev.db';

const isPostgres = /^postgres(ql)?:\/\//.test(url);
const provider = isPostgres ? 'postgresql' : 'sqlite';

// `relationJoins` lets Prisma fetch a row and its relations in ONE query via a
// LATERAL join, instead of one query per relation. Loading a day with its meals
// and meetings goes from 3 round trips to 1 — the difference between ~900ms and
// ~300ms against a database on another continent. Postgres/MySQL only, so it is
// switched off for SQLite alongside the provider.
const previewFeatures = isPostgres ? '["relationJoins"]' : '[]';

const schema = readFileSync(schemaPath, 'utf8');

const updated = schema
  .replace(/(datasource db \{[^}]*?provider\s*=\s*)"[a-z]+"/s, `$1"${provider}"`)
  .replace(
    /(generator client \{[^}]*?previewFeatures\s*=\s*)\[[^\]]*\]/s,
    `$1${previewFeatures}`,
  );

if (updated !== schema) {
  writeFileSync(schemaPath, updated);
}
console.log(`[db] provider=${provider} previewFeatures=${previewFeatures}`);
