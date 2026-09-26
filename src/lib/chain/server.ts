import 'server-only';
import { createPublicClient, createWalletClient, http, type Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia, hardhat, mainnet } from 'viem/chains';
import { CHAIN_ID, ADDRESSES } from '@/lib/chain/config';

/**
 * The server's own connection to the chain, and the verifier key.
 *
 * `server-only` is not decoration: this module reads a private key, and an
 * accidental import from a client component would put it in the browser bundle.
 * The import fails the build instead.
 *
 * The verifier key is the one genuinely dangerous secret this app holds. It can
 * mark any goal succeeded — minting reward tokens — so it belongs in the
 * server's .env and nowhere else. It deliberately cannot move funds beyond that:
 * VERIFIER_ROLE grants no power to change fees, drain the treasury, or mint
 * directly, which is why the role exists separately from the admin.
 */

const CHAINS = { 1: mainnet, 11155111: sepolia, 31337: hardhat } as const;

function chain() {
  return CHAINS[CHAIN_ID as keyof typeof CHAINS] ?? sepolia;
}

export const publicClient = createPublicClient({
  chain: chain(),
  transport: http(process.env.RPC_URL || undefined),
});

export const verifierConfigured = Boolean(
  process.env.VERIFIER_PRIVATE_KEY && ADDRESSES.goalManager,
);

/**
 * A wallet client for the verifier, or null when no key is set.
 *
 * Null rather than throwing at import time: the app must keep working with the
 * staking feature simply switched off, which is the state of every deployment
 * that has not opted into it.
 */
export function verifierClient() {
  const key = process.env.VERIFIER_PRIVATE_KEY;
  if (!key) return null;

  const account = privateKeyToAccount(
    (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`,
  );
  return createWalletClient({
    account,
    chain: chain(),
    transport: http(process.env.RPC_URL || undefined),
  });
}

export const goalManagerAddress = ADDRESSES.goalManager as Address;
export const logAnchorAddress = ADDRESSES.logAnchor as Address;
export const goalTokenAddress = ADDRESSES.goalToken as Address;
