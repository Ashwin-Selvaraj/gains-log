import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';
import { CHAIN_ID } from '@/lib/chain/config';
import { evaluateGoal } from '@/lib/chain/evaluate';
import { goalManagerAbi } from '@/lib/chain/abis';
import { verifierClient, verifierConfigured, goalManagerAddress, publicClient } from '@/lib/chain/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Asks the server to check a goal and, if it was met, settle it on-chain.
 *
 * The user triggers this; the server does not decide on its own that the
 * answer is yes. That ordering matters — the verifier key can mint tokens, so
 * it should act only when asked, against a question it re-answers from the
 * logs each time rather than trusting anything the client sends.
 *
 * Nothing the request body says is used except which goal. Target, metric and
 * window all come from the row written when the goal was staked.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  if (!verifierConfigured) {
    return NextResponse.json(
      { error: 'On-chain verification is not configured on this server.' },
      { status: 501 },
    );
  }

  const { goalId } = (await req.json()) as { goalId?: number };
  if (!Number.isInteger(goalId)) {
    return NextResponse.json({ error: 'goalId required' }, { status: 400 });
  }

  const goal = await prisma.stakedGoal.findUnique({
    where: { chainId_goalId: { chainId: CHAIN_ID, goalId: goalId! } },
  });
  // Scoped to the caller: knowing a goal id must not let anyone settle it.
  if (!goal || goal.userId !== user.id) {
    return NextResponse.json({ error: 'No such goal.' }, { status: 404 });
  }

  const verdict = await evaluateGoal(goal);
  if (!verdict.met) {
    // Not an error — a truthful "not yet", with the numbers behind it.
    return NextResponse.json({ settled: false, verdict }, { status: 200 });
  }

  // The chain is asked too, so a goal already settled (or failed past its
  // deadline by someone else) does not produce a confusing revert.
  const onChain = await publicClient.readContract({
    address: goalManagerAddress,
    abi: goalManagerAbi,
    functionName: 'getGoal',
    args: [BigInt(goalId!)],
  });
  if (onChain.status !== 1) {
    return NextResponse.json(
      { settled: false, verdict, error: 'That goal is no longer active on-chain.' },
      { status: 409 },
    );
  }

  const wallet = verifierClient();
  if (!wallet) {
    return NextResponse.json({ error: 'Verifier key unavailable.' }, { status: 501 });
  }

  try {
    const hash = await wallet.writeContract({
      address: goalManagerAddress,
      abi: goalManagerAbi,
      functionName: 'verifySuccess',
      args: [BigInt(goalId!)],
      chain: wallet.chain,
      account: wallet.account,
    });
    return NextResponse.json({ settled: true, verdict, txHash: hash });
  } catch (err) {
    console.error('[chain/verify]', err);
    return NextResponse.json(
      {
        settled: false,
        verdict,
        error:
          err instanceof Error
            ? `The chain rejected it: ${err.message.split('\n')[0]}`
            : 'The transaction failed.',
      },
      { status: 502 },
    );
  }
}
