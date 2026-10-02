/**
 * Clears the app's records of a testnet token after the contracts are
 * redeployed.
 *
 *   node scripts/reset-testnet-token.mjs          # dry run: prints what it would do
 *   node scripts/reset-testnet-token.mjs --apply  # does it
 *
 * A redeploy starts from fresh contracts, so three things the database holds
 * about the old ones become wrong:
 *  - StakedGoal rows point at pledges in the old GoalManager. The new one
 *    numbers pledges from 1 again, so an old row would collide with — and
 *    shadow — a brand-new pledge of the same number.
 *  - starterGrantAt says someone already got their starter tokens, but those
 *    were the old token. Clearing it lets them claim in the new one.
 *  - RewardClaim rows mark quests as paid, in the old token. Clearing them
 *    lets earned quests be claimed again in the new one.
 *
 * Testnet only: on a real network these records are people's money.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const TESTNETS = new Set([31337, 11155111, 97]);
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 97);
const apply = process.argv.includes('--apply');

if (!TESTNETS.has(chainId)) {
  console.error(`Refusing: chain ${chainId} is not a testnet.`);
  process.exit(1);
}

const prisma = new PrismaClient();

const [goals, grants, claims] = await Promise.all([
  prisma.stakedGoal.count({ where: { chainId } }),
  prisma.user.count({ where: { starterGrantAt: { not: null } } }),
  prisma.rewardClaim.count(),
]);

console.log(`chain ${chainId}`);
console.log(`  staked goals to delete:     ${goals}`);
console.log(`  starter grants to reset:    ${grants}`);
console.log(`  reward claims to delete:    ${claims}`);

if (!apply) {
  console.log('\nDry run — nothing changed. Re-run with --apply to do it.');
} else {
  await prisma.$transaction([
    prisma.stakedGoal.deleteMany({ where: { chainId } }),
    prisma.user.updateMany({ where: { starterGrantAt: { not: null } }, data: { starterGrantAt: null } }),
    prisma.rewardClaim.deleteMany({}),
  ]);
  console.log('\nDone. Everyone can claim starter tokens and earned quests in the new token.');
}

await prisma.$disconnect();
