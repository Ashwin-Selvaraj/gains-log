import 'server-only';
import { getAddress, parseEther, type Hash } from 'viem';
import { CHAIN_ID } from '@/lib/chain/config';
import { goalTokenAbi } from '@/lib/chain/abis';
import { publicClient, verifierClient, goalTokenAddress } from '@/lib/chain/server';

/** Local chain, Sepolia, BSC Testnet. Tokens here are worthless by design. */
export const TESTNETS = new Set([31337, 11155111, 97]);

/**
 * Whether the server may hand out GAINS from its float at all.
 *
 * On by default only on testnets. On a real network, paying tokens for app
 * activity is a policy (and a farming target), so it needs an explicit
 * REWARDS_ENABLED=true rather than coming along with a deploy.
 */
export const payoutsEnabled =
  TESTNETS.has(CHAIN_ID) || process.env.REWARDS_ENABLED === 'true';

/**
 * Sends GAINS from the treasury float (the signer's own balance) and waits for
 * it to land. Throws with a sentence a person can read when it can't.
 *
 * The caller owns idempotency — claim a database row first, then pay, then
 * release the row if this throws — because only the caller knows what the
 * payment is for.
 */
export async function payFromTreasury(to: string, amountGoal: number): Promise<Hash> {
  const wallet = await verifierClient();
  if (!wallet) throw new Error('The token treasury is not configured.');

  const amount = parseEther(String(amountGoal));
  const float = await publicClient.readContract({
    address: goalTokenAddress,
    abi: goalTokenAbi,
    functionName: 'balanceOf',
    args: [wallet.account.address],
  });
  if (float < amount) throw new Error('The reward pool is empty — ask the admin to top it up.');

  const hash = await wallet.writeContract({
    address: goalTokenAddress,
    abi: goalTokenAbi,
    functionName: 'transfer',
    args: [getAddress(to), amount],
    chain: wallet.chain,
    account: wallet.account,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
