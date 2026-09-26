import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';
import { CHAIN_ID } from '@/lib/chain/config';
import { METRIC_KEYS } from '@/lib/chain/evaluate';
import { evaluateGoal } from '@/lib/chain/evaluate';

export const dynamic = 'force-dynamic';

/**
 * The app-side record of a staked goal: what it means, so it can be judged.
 *
 * Written after the on-chain transaction confirms, never before — a row here
 * for a goal that does not exist on-chain would be a goal the verifier could
 * be asked to approve with nothing staked behind it.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as Record<string, unknown>;
  const goalId = Number(body.goalId);
  const metric = String(body.metric ?? '');
  const target = Number(body.target);
  const deadline = new Date(String(body.deadline ?? ''));
  const exerciseKey = body.exerciseKey ? String(body.exerciseKey) : null;
  const txHash = body.txHash ? String(body.txHash) : null;

  if (!Number.isInteger(goalId) || goalId <= 0) {
    return NextResponse.json({ error: 'goalId required' }, { status: 400 });
  }
  if (!METRIC_KEYS.includes(metric)) {
    return NextResponse.json({ error: `Unknown metric "${metric}"` }, { status: 400 });
  }
  if (!Number.isFinite(target) || target <= 0) {
    return NextResponse.json({ error: 'target must be a positive number' }, { status: 400 });
  }
  if (Number.isNaN(deadline.getTime())) {
    return NextResponse.json({ error: 'deadline must be a date' }, { status: 400 });
  }

  const goal = await prisma.stakedGoal.upsert({
    where: { chainId_goalId: { chainId: CHAIN_ID, goalId } },
    // Update is empty on purpose: the definition is fixed at creation. If it
    // could be revised, the verifier could later be pointed at an easier
    // question than the one that was staked on.
    update: {},
    create: {
      userId: user.id,
      chainId: CHAIN_ID,
      goalId,
      metric,
      exerciseKey,
      target: Math.round(target),
      startsAt: new Date(),
      deadline,
      txHash,
    },
  });

  return NextResponse.json(goal, { status: 201 });
}

/** This user's staked goals, each with where it currently stands. */
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const goals = await prisma.stakedGoal.findMany({
    where: { userId: user.id, chainId: CHAIN_ID },
    orderBy: { createdAt: 'desc' },
  });

  const withProgress = await Promise.all(
    goals.map(async (goal) => ({
      ...goal,
      progress: await evaluateGoal(goal),
    })),
  );

  return NextResponse.json(withProgress);
}
