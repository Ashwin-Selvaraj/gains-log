import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';
import { chainConfigured } from '@/lib/chain/config';
import { payFromTreasury, payoutsEnabled } from '@/lib/chain/treasury';
import { canClaim, evaluate } from '@/lib/rewards';
import { buildSnapshot, monthStart, trustedToday } from '@/lib/rewards-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Quests, progress, what's claimable, and this month's leaderboard.
 *
 * Works without a wallet: seeing what you could earn is the reason to set
 * one up. Only claiming needs it.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const today = trustedToday(new URL(req.url).searchParams.get('today'));
  const since = monthStart(today);

  const [snapshot, claims, me, board] = await Promise.all([
    buildSnapshot(user.id, today),
    prisma.rewardClaim.findMany({
      where: { userId: user.id, txHash: { not: null } },
      select: { ruleKey: true, periodKey: true, amount: true },
    }),
    prisma.user.findUnique({ where: { id: user.id }, select: { walletAddress: true } }),
    prisma.rewardClaim.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: since }, txHash: { not: null } },
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    }),
  ]);

  const paid = new Set(claims.map((c) => `${c.ruleKey}:${c.periodKey}`));
  const times = new Map<string, number>();
  for (const c of claims) times.set(c.ruleKey, (times.get(c.ruleKey) ?? 0) + 1);

  // First names only: the board is for a bit of rivalry between people who
  // already know each other, not for publishing anyone's email.
  const names = await prisma.user.findMany({
    where: { id: { in: board.slice(0, 10).map((b) => b.userId) } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(names.map((u) => [u.id, u.name?.trim().split(/\s+/)[0] || 'Athlete']));
  const myIndex = board.findIndex((b) => b.userId === user.id);

  return NextResponse.json({
    today,
    enabled: chainConfigured && payoutsEnabled,
    walletLinked: Boolean(me?.walletAddress),
    streak: snapshot.streak,
    earned: claims.reduce((sum, c) => sum + c.amount, 0),
    quests: evaluate(snapshot, paid, times),
    leaderboard: {
      month: since.toLocaleDateString('en', { month: 'long' }),
      top: board.slice(0, 10).map((b, i) => ({
        rank: i + 1,
        name: nameOf.get(b.userId) ?? 'Athlete',
        earned: b._sum.amount ?? 0,
        you: b.userId === user.id,
      })),
      you: myIndex >= 0 ? { rank: myIndex + 1, earned: board[myIndex]._sum.amount ?? 0 } : null,
      players: board.length,
    },
  });
}

/**
 * Claims one quest for one period.
 *
 * The client only names the quest; whether it's earned is re-decided here
 * from the logs. The row goes in first under a unique key, so double taps and
 * parallel tabs can't both pay, and is removed again if the transfer fails so
 * the reward stays claimable.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  if (!chainConfigured || !payoutsEnabled) {
    return NextResponse.json({ error: 'Rewards are not switched on here.' }, { status: 403 });
  }

  const body = (await req.json()) as { ruleKey?: string; periodKey?: string; today?: string };
  const today = trustedToday(body.today ?? null);
  const ruleKey = String(body.ruleKey ?? '');
  const periodKey = String(body.periodKey ?? '');

  const me = await prisma.user.findUnique({ where: { id: user.id }, select: { walletAddress: true } });
  if (!me?.walletAddress) {
    return NextResponse.json({ error: 'Connect a wallet on the Pledges tab to claim.' }, { status: 400 });
  }

  const rule = canClaim(await buildSnapshot(user.id, today), ruleKey, periodKey);
  if (!rule) {
    return NextResponse.json({ error: "That one isn't earned yet — keep going." }, { status: 409 });
  }

  let claimId: string;
  try {
    const row = await prisma.rewardClaim.create({
      data: { userId: user.id, ruleKey, periodKey, amount: rule.amount },
      select: { id: true },
    });
    claimId = row.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json({ error: 'Already claimed — nice try though.' }, { status: 409 });
    }
    throw err;
  }

  try {
    const txHash = await payFromTreasury(me.walletAddress, rule.amount);
    await prisma.rewardClaim.update({ where: { id: claimId }, data: { txHash } });
    return NextResponse.json({ amount: rule.amount, title: rule.title, emoji: rule.emoji, txHash });
  } catch (err) {
    await prisma.rewardClaim.delete({ where: { id: claimId } }).catch(() => {});
    console.error('[rewards] payout', ruleKey, periodKey, err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message.split('\n')[0] : 'Transfer failed.' },
      { status: 502 },
    );
  }
}
