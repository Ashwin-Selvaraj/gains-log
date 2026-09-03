/**
 * Grants admin to an account, and puts it on the invite list.
 *
 *   node scripts/grant-admin.mjs you@gmail.com
 *
 * Admin is a column on User rather than an env var, so the master account
 * survives redeploys and can be handed over without a code change. This script
 * exists because the first admin cannot be granted from the admin screen —
 * you would need admin to reach it. Everyone after that is added from the UI.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const email = (process.argv[2] ?? '').trim().toLowerCase();

if (!email.includes('@')) {
  console.error('usage: node scripts/grant-admin.mjs you@gmail.com');
  process.exit(1);
}

const user = await prisma.user.upsert({
  where: { email },
  create: { email, name: email.split('@')[0], isAdmin: true },
  update: { isAdmin: true },
});

await prisma.allowedEmail.upsert({
  where: { email },
  create: { email, note: 'admin', addedBy: 'grant-admin script' },
  update: {},
});

console.log(`${user.email} is now an admin and on the invite list`);
await prisma.$disconnect();
