import 'server-only';
import { createPublicClient, createWalletClient, http, type Address } from 'viem';
import { sepolia, hardhat, mainnet, bsc, bscTestnet } from 'viem/chains';
import { CHAIN_ID, ADDRESSES } from '@/lib/chain/config';
import { verifierAccount, verifierConfigured as signerConfigured } from '@/lib/chain/signer';

/**
 * The server's own connection to the chain, and the verifier's wallet client.
 *
 * `server-only` is not decoration: signer.ts reads a private key (or a KMS
 * key id), and an accidental import from a client component would put that
 * in the browser bundle. The import fails the build instead.
 *
 * The verifier key is the one genuinely dangerous secret this app holds. It can
 * mark any goal succeeded — minting reward tokens — so it belongs in the
 * server's .env (or KMS) and nowhere else. It deliberately cannot move funds
 * beyond that: VERIFIER_ROLE grants no power to change fees, drain the
 * treasury, or mint directly, which is why the role exists separately from
 * the admin. Which mode signs — a raw env key or AWS KMS — is signer.ts's
 * concern; this file just asks for an account and uses it.
 */

const CHAINS = { 1: mainnet, 56: bsc, 97: bscTestnet, 11155111: sepolia, 31337: hardhat } as const;

function chain() {
  return CHAINS[CHAIN_ID as keyof typeof CHAINS] ?? bscTestnet;
}

export const publicClient = createPublicClient({
  chain: chain(),
  transport: http(process.env.RPC_URL || undefined),
});

export const verifierConfigured = Boolean(signerConfigured && ADDRESSES.goalManager);

/**
 * A wallet client for the verifier, or null when no signer is configured.
 *
 * Null rather than throwing at import time: the app must keep working with the
 * staking feature simply switched off, which is the state of every deployment
 * that has not opted into it.
 */
export async function verifierClient() {
  const accountPromise = verifierAccount();
  if (!accountPromise) return null;

  const account = await accountPromise;
  return createWalletClient({
    account,
    chain: chain(),
    transport: http(process.env.RPC_URL || undefined),
  });
}

export const goalManagerAddress = ADDRESSES.goalManager as Address;
export const logAnchorAddress = ADDRESSES.logAnchor as Address;
export const goalTokenAddress = ADDRESSES.goalToken as Address;
