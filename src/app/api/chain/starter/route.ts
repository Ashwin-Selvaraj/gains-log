import { NextResponse } from 'next/server';
import { getAddress, parseEther } from 'viem';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';
import { CHAIN_ID } from '@/lib/chain/config';
import { goalTokenAbi } from '@/lib/chain/abis';
import { publicClient, verifierClient, goalTokenAddress } from '@/lib/chain/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const STARTER_GRANT = 100;

/** Local chain, Sepolia, BSC Testnet. Tokens here are worthless by design. */
const TESTNETS = new Set([31337, 11155111, 97]);

/**
 * A one-time float of GOAL so a new person can make their first pledge.
 *
 * Without it the feature is dead on arrival for everyone except whoever holds
 * the deployer's initial mint: there's no market to buy GOAL on, and the only
 * other way to earn it is to complete a pledge — which needs GOAL to start.
 *
 * Testnet-only on purpose. On a real network, handing out tokens on request is
 * a policy decision (and an obvious farming target), not a UI convenience.
 */
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { starterGrantAt: true },
  });
  return NextResponse.json({
    available: TESTNETS.has(CHAIN_ID) && !row?.starterGrantAt,
    amount: STARTER_GRANT,
  });
}

export async function POST() {
  const user = await requireUser();
  if (!user) return unauthorized();

  if (!TESTNETS.has(CHAIN_ID)) {
    return NextResponse.json({ error: 'Starter tokens are testnet-only.' }, { status: 403 });
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { walletAddress: true },
  });
  if (!row?.walletAddress) {
    return NextResponse.json({ error: 'Connect a wallet first.' }, { status: 400 });
  }

  const wallet = await verifierClient();
  if (!wallet) {
    return NextResponse.json({ error: 'The token treasury is not configured.' }, { status: 501 });
  }

  // Claimed before sending, conditionally: two taps racing each other both
  // pass a read-then-write check, but only one of them can flip null → now.
  const claimed = await prisma.user.updateMany({
    where: { id: user.id, starterGrantAt: null },
    data: { starterGrantAt: new Date() },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: 'Starter tokens were already claimed.' }, { status: 409 });
  }

  const amount = parseEther(String(STARTER_GRANT));
  try {
    const float = await publicClient.readContract({
      address: goalTokenAddress,
      abi: goalTokenAbi,
      functionName: 'balanceOf',
      args: [wallet.account.address],
    });
    if (float < amount) throw new Error('The starter pool is empty — ask the admin to top it up.');

    const hash = await wallet.writeContract({
      address: goalTokenAddress,
      abi: goalTokenAbi,
      functionName: 'transfer',
      args: [getAddress(row.walletAddress), amount],
      chain: wallet.chain,
      account: wallet.account,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return NextResponse.json({ amount: STARTER_GRANT, txHash: hash });
  } catch (err) {
    // Nothing arrived, so the grant is still owed — release the claim.
    await prisma.user.update({ where: { id: user.id }, data: { starterGrantAt: null } });
    console.error('[chain/starter]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message.split('\n')[0] : 'Transfer failed.' },
      { status: 502 },
    );
  }
}
