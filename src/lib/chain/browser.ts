'use client';

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type EIP1193Provider,
} from 'viem';
import { sepolia, hardhat, mainnet } from 'viem/chains';
import { CHAIN_ID, ADDRESSES } from '@/lib/chain/config';

/**
 * Talking to the chain from the browser, with no wallet library.
 *
 * viem plus `window.ethereum` rather than wagmi or a connector kit: this app
 * has nine runtime dependencies and one wallet flow, and a connector framework
 * would be a larger addition than the feature it serves. The cost is that only
 * injected wallets work — MetaMask and its siblings, not WalletConnect — which
 * is the right trade while staking is one optional screen.
 */

const CHAINS = { 1: mainnet, 11155111: sepolia, 31337: hardhat } as const;
export const chain = CHAINS[CHAIN_ID as keyof typeof CHAINS] ?? sepolia;

export const publicClient = createPublicClient({ chain, transport: http() });

export const goalToken = ADDRESSES.goalToken as Address;
export const goalManager = ADDRESSES.goalManager as Address;

function provider(): EIP1193Provider | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null;
}

export const hasWallet = () => provider() !== null;

export function walletClient() {
  const eth = provider();
  if (!eth) throw new Error('No wallet found. Install MetaMask to stake.');
  return createWalletClient({ chain, transport: custom(eth) });
}

/** Prompts for accounts and returns the first, checksummed by viem. */
export async function connect(): Promise<Address> {
  const [address] = await walletClient().requestAddresses();
  if (!address) throw new Error('No account was shared.');
  return address;
}

/**
 * Makes sure the wallet is pointed at the same network the app is.
 *
 * Worth doing before any write: a transaction sent on the wrong chain does not
 * fail loudly, it succeeds somewhere nobody is looking, against contracts that
 * are not these ones.
 */
export async function ensureChain(): Promise<void> {
  const eth = provider();
  if (!eth) throw new Error('No wallet found.');

  const current = await eth.request({ method: 'eth_chainId' });
  if (parseInt(current as string, 16) === chain.id) return;

  try {
    await eth.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${chain.id.toString(16)}` }],
    });
  } catch {
    throw new Error(`Switch your wallet to ${chain.name} and try again.`);
  }
}
