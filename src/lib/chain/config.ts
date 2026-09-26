/**
 * Where the contracts live, per network.
 *
 * Addresses come from env rather than a checked-in constant because the same
 * build is deployed against a local chain, Sepolia and (one day) mainnet, and
 * a redeploy changes them. The deploy script prints these ready to paste.
 *
 * Everything here is NEXT_PUBLIC_ because the browser needs it to talk to the
 * chain. That is safe — addresses are public by definition. Nothing secret
 * belongs in this file; the verifier's key stays server-side in VERIFIER_PRIVATE_KEY.
 */

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111);

export const ADDRESSES = {
  goalToken: process.env.NEXT_PUBLIC_GOAL_TOKEN_ADDRESS ?? '',
  goalManager: process.env.NEXT_PUBLIC_GOAL_MANAGER_ADDRESS ?? '',
  logAnchor: process.env.NEXT_PUBLIC_LOG_ANCHOR_ADDRESS ?? '',
} as const;

/**
 * Whether staking is wired up at all.
 *
 * Checked before anything chain-related renders, so an app deployed without
 * these variables simply does not show the feature — rather than showing it
 * and failing at the first click with an address of "0x".
 */
export const chainConfigured = Boolean(
  ADDRESSES.goalToken && ADDRESSES.goalManager && ADDRESSES.logAnchor,
);

/** Human name for the network, for the one place the UI has to say it. */
export function chainName(id: number = CHAIN_ID): string {
  if (id === 11155111) return 'Sepolia';
  if (id === 31337) return 'Local chain';
  if (id === 1) return 'Ethereum';
  return `Chain ${id}`;
}
