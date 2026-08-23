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

const provider = /^postgres(ql)?:\/\//.test(url) ? 'postgresql' : 'sqlite';

const schema = readFileSync(schemaPath, 'utf8');
const updated = schema.replace(
  /(datasource db \{[^}]*?provider\s*=\s*)"[a-z]+"/s,
  `$1"${provider}"`,
);

if (updated !== schema) {
  writeFileSync(schemaPath, updated);
  console.log(`[db] schema provider -> ${provider}`);
} else {
  console.log(`[db] schema provider already ${provider}`);
}
