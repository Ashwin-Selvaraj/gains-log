'use client';

import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  type Address,
  type EIP1193Provider,
} from 'viem';
import { sepolia, hardhat, mainnet, bsc, bscTestnet } from 'viem/chains';
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

const CHAINS = { 1: mainnet, 56: bsc, 97: bscTestnet, 11155111: sepolia, 31337: hardhat } as const;
export const chain = CHAINS[CHAIN_ID as keyof typeof CHAINS] ?? bscTestnet;

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

/**
 * The account this site is already authorised for, without a prompt.
 *
 * `eth_accounts` rather than `eth_requestAccounts`: reopening the tab should
 * show your balance straight away, not a wallet popup you didn't ask for.
 */
export async function silentAccount(): Promise<Address | null> {
  const eth = provider();
  if (!eth) return null;
  try {
    const accounts = (await eth.request({ method: 'eth_accounts' })) as string[];
    return accounts[0] ? getAddress(accounts[0]) : null;
  } catch {
    return null;
  }
}

/** Link to a transaction or address on this network's block explorer, if it has one. */
export function explorerUrl(kind: 'tx' | 'address' | 'token', value: string): string | null {
  const base = chain.blockExplorers?.default.url;
  return base ? `${base}/${kind}/${value}` : null;
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
    await walletClient().switchChain({ id: chain.id });
  } catch (err) {
    // 4902: the wallet has never heard of this network. MetaMask ships with
    // Ethereum networks only, so on BSC Testnet this is the common case, not
    // an edge case — add it rather than tell the user to go find RPC settings.
    const code = (err as { code?: number; cause?: { code?: number } }).code ??
      (err as { cause?: { code?: number } }).cause?.code;
    if (code === 4902) {
      try {
        await walletClient().addChain({ chain });
        return;
      } catch {
        /* fall through to the message below */
      }
    }
    throw new Error(`Switch your wallet to ${chain.name} and try again.`);
  }
}

/** True when the wallet is on the network the app's contracts live on. */
export async function onRightChain(): Promise<boolean> {
  const eth = provider();
  if (!eth) return false;
  const current = await eth.request({ method: 'eth_chainId' });
  return parseInt(current as string, 16) === chain.id;
}

/** Subscribes to wallet account/network switches; returns an unsubscribe. */
export function onWalletChange(handler: () => void): () => void {
  const eth = provider() as (EIP1193Provider & {
    removeListener?: (event: string, fn: () => void) => void;
  }) | null;
  if (!eth?.on) return () => {};
  eth.on('accountsChanged', handler);
  eth.on('chainChanged', handler);
  return () => {
    eth.removeListener?.('accountsChanged', handler);
    eth.removeListener?.('chainChanged', handler);
  };
}

/** Turns a wallet/RPC error into one sentence a person can act on. */
export function friendlyError(err: unknown): string {
  const e = err as { code?: number; name?: string; shortMessage?: string; message?: string };
  if (e?.code === 4001 || e?.name === 'UserRejectedRequestError') {
    return 'You cancelled that in your wallet — nothing was sent.';
  }
  const msg = e?.shortMessage ?? e?.message ?? 'Something went wrong.';
  if (/insufficient funds/i.test(msg)) {
    return `Not enough ${chain.nativeCurrency.symbol} for network fees. Top up from the faucet and try again.`;
  }
  return msg.split('\n')[0];
}
