'use client';

import { createPublicClient, createWalletClient, custom, getAddress, http, type Address, type Hex } from 'viem';
import { sepolia, hardhat, mainnet, bsc, bscTestnet } from 'viem/chains';
import type { MetamaskConnectEVM } from '@metamask/connect-evm';
import { CHAIN_ID, ADDRESSES } from '@/lib/chain/config';

/**
 * Talking to the chain from the browser.
 *
 * Wallet access goes through MetaMask Connect rather than `window.ethereum`.
 * A phone browser never has `window.ethereum` — MetaMask on a phone is an
 * app, not an extension — so the old injected-only approach could only work
 * by sending people into MetaMask's own browser and leaving the app. With
 * Connect, the page stays where it is: tapping Connect opens the MetaMask app
 * for approval and comes back. On desktop it uses the extension (or a QR code
 * when there isn't one), and inside MetaMask's browser it uses that directly.
 *
 * Reads (balances, pledge state) don't touch the wallet at all — they go
 * straight to the network over `publicClient`, so they work before anyone
 * connects and regardless of which network the wallet is sitting on.
 */

const CHAINS = { 1: mainnet, 56: bsc, 97: bscTestnet, 11155111: sepolia, 31337: hardhat } as const;
export const chain = CHAINS[CHAIN_ID as keyof typeof CHAINS] ?? bscTestnet;
const CHAIN_HEX = `0x${chain.id.toString(16)}` as Hex;

export const publicClient = createPublicClient({ chain, transport: http() });

export const goalToken = ADDRESSES.goalToken as Address;
export const goalManager = ADDRESSES.goalManager as Address;

/**
 * RPC endpoints offered to the wallet when it adds this network.
 *
 * publicnode first for BSC Testnet: Binance's own seed nodes are viem's
 * default but rate-limit hard, and MetaMask checks the endpoint answers with
 * the right chain id before it will add the network.
 */
const WALLET_RPC: Record<number, string[]> = {
  97: ['https://bsc-testnet-rpc.publicnode.com', ...bscTestnet.rpcUrls.default.http],
};

/** What MetaMask needs to add this network when it hasn't seen it before. */
const CHAIN_CONFIG = {
  chainId: CHAIN_HEX,
  chainName: chain.name,
  nativeCurrency: chain.nativeCurrency,
  rpcUrls: WALLET_RPC[chain.id] ?? [...chain.rpcUrls.default.http],
  blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
};

let clientPromise: Promise<MetamaskConnectEVM> | null = null;

/**
 * The last "open MetaMask" link, for a manual fallback.
 *
 * The connector opens the app a moment after the tap, once its relay session
 * exists — and iOS Safari can refuse to switch apps when the navigation isn't
 * directly inside a tap. Remembering the link lets the page show a plain
 * "Open MetaMask" link, which always works because tapping it is a gesture.
 */
const openLinkListeners = new Set<(url: string) => void>();
export function onWalletLink(listener: (url: string) => void): () => void {
  openLinkListeners.add(listener);
  return () => openLinkListeners.delete(listener);
}
function openWalletLink(url: string) {
  openLinkListeners.forEach((l) => l(url));
  window.location.href = url;
}

/**
 * The MetaMask Connect client, created once and on first use.
 *
 * Imported dynamically so its weight lands only on the Pledges tab, not on
 * every screen of the app. Creation also restores any previous session, so a
 * reload stays connected without a new approval.
 */
export function walletConnector(): Promise<MetamaskConnectEVM> {
  if (!clientPromise) {
    clientPromise = import('@metamask/connect-evm')
      .then(({ createEVMClient }) =>
        createEVMClient({
          dapp: {
            name: 'Gains Log',
            url: window.location.origin,
            iconUrl: `${window.location.origin}/icon-192.png`,
          },
          api: { supportedNetworks: { [CHAIN_HEX]: chain.rpcUrls.default.http[0] } },
          // The connector's own usage analytics; nothing here needs them.
          analytics: { enabled: false },
          mobile: { preferredOpenLink: openWalletLink },
        }),
      )
      .catch((err) => {
        // Let the next attempt start over instead of caching a failure.
        clientPromise = null;
        throw err;
      });
  }
  return clientPromise;
}

export async function walletClient() {
  const client = await walletConnector();
  return createWalletClient({ chain, transport: custom(client.getProvider()) });
}

/** The account a previous session left connected, without prompting. */
export async function silentAccount(): Promise<Address | null> {
  try {
    const client = await walletConnector();
    const account = client.status === 'connected' ? client.getAccount() : undefined;
    return account ? getAddress(account) : null;
  } catch {
    return null;
  }
}

/**
 * Connects and lands the wallet on the app's network, in as few prompts as
 * MetaMask allows.
 *
 * The network is part of the connect request itself, so a wallet that already
 * knows BSC Testnet comes back on it from the one approval. One that has never
 * heard of it gets a second prompt to add it — MetaMask doesn't add networks
 * as a side effect of connecting.
 */
export async function connect(): Promise<Address> {
  const client = await walletConnector();
  const { accounts, chainId } = await client.connect({ chainIds: [CHAIN_HEX], forceRequest: true });
  const address = accounts[0];
  if (!address) throw new Error('No account was shared.');
  if (chainId?.toLowerCase() !== CHAIN_HEX) await ensureChain();
  return getAddress(address);
}

export async function disconnect(): Promise<void> {
  const client = await walletConnector();
  await client.disconnect();
}

/**
 * Makes sure the wallet is pointed at the app's network, adding it if needed.
 *
 * Worth doing before any write: a transaction sent on the wrong chain does not
 * fail loudly, it succeeds somewhere nobody is looking, against contracts that
 * are not these ones.
 */
export async function ensureChain(): Promise<void> {
  const client = await walletConnector();
  if (client.getChainId()?.toLowerCase() === CHAIN_HEX) return;
  try {
    await client.switchChain({ chainId: CHAIN_HEX, chainConfiguration: CHAIN_CONFIG });
  } catch (err) {
    if (isRejection(err)) throw err;
    throw new Error(`Switch your wallet to ${chain.name} and try again.`);
  }
}

/**
 * Adds the app's network to MetaMask and switches MetaMask to it.
 *
 * Connecting isn't enough on a phone. MetaMask Connect stamps every request
 * with the network it's for, so pledges and claims land on BSC Testnet either
 * way — and because of that, its own switchChain() only switches internally
 * once the network is part of the session, never telling MetaMask. The result
 * was a wallet that worked but still showed Ethereum, with BSC Testnet never
 * added, so GAINS could not be shown in it. `wallet_addEthereumChain` always
 * goes to MetaMask: it adds the network if missing, and switches to it.
 */
export async function addNetworkToWallet(): Promise<void> {
  const client = await walletConnector();
  await client.getProvider().request({ method: 'wallet_addEthereumChain', params: [CHAIN_CONFIG] });
}

/**
 * Asks MetaMask to list the token, so the balance shows up in the wallet.
 *
 * Symbol and decimals are read from the contract rather than hard-coded:
 * MetaMask rejects a watch request whose symbol disagrees with the token's
 * own, which is exactly the failure a rename would cause.
 */
export async function addTokenToWallet(): Promise<void> {
  const [symbol, decimals] = await Promise.all([
    publicClient.readContract({ address: goalToken, abi: tokenMetaAbi, functionName: 'symbol' }),
    publicClient.readContract({ address: goalToken, abi: tokenMetaAbi, functionName: 'decimals' }),
  ]);
  const client = await walletConnector();
  const added = await client.getProvider().request({
    method: 'wallet_watchAsset',
    params: {
      type: 'ERC20',
      options: {
        address: goalToken,
        symbol,
        decimals,
        image: `${window.location.origin}/icon-512.png`,
      },
    },
  });
  if (added === false) throw new Error('MetaMask didn’t add the token — try again.');
}

const tokenMetaAbi = [
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
] as const;

/** Subscribes to account, network and disconnect events; returns an unsubscribe. */
export function onWalletChange(handler: () => void): () => void {
  let unsubs: (() => void)[] = [];
  let cancelled = false;
  void walletConnector()
    .then((client) => {
      if (cancelled) return;
      const provider = client.getProvider();
      unsubs = [
        provider.on('accountsChanged', handler),
        provider.on('chainChanged', handler),
        provider.on('connect', handler),
        provider.on('disconnect', handler),
      ];
    })
    .catch(() => {});
  return () => {
    cancelled = true;
    unsubs.forEach((u) => u());
  };
}

/** Link to a transaction or address on this network's block explorer, if it has one. */
export function explorerUrl(kind: 'tx' | 'address' | 'token', value: string): string | null {
  const base = chain.blockExplorers?.default.url;
  return base ? `${base}/${kind}/${value}` : null;
}

export function isRejection(err: unknown): boolean {
  const e = err as { code?: number; name?: string; message?: string };
  return e?.code === 4001 || e?.name === 'UserRejectedRequestError' || /reject|denied|cancel/i.test(e?.message ?? '');
}

/** Turns a wallet/RPC error into one sentence a person can act on. */
export function friendlyError(err: unknown): string {
  if (isRejection(err)) return 'You cancelled that in MetaMask — nothing was sent.';
  const e = err as { shortMessage?: string; message?: string };
  const msg = e?.shortMessage ?? e?.message ?? 'Something went wrong.';
  if (/insufficient funds/i.test(msg)) {
    return `Not enough ${chain.nativeCurrency.symbol} for network fees. Top up from the faucet and try again.`;
  }
  return msg.split('\n')[0];
}
