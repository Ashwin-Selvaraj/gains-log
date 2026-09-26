/**
 * Only the parts of each contract the app actually calls.
 *
 * Hand-written rather than imported from Hardhat's artifacts: the artifacts are
 * in a separate npm project the PWA must not depend on, and the full ABIs carry
 * every internal error and admin setter into a phone's bundle for no reason.
 * Everything here is `as const` so viem infers argument and return types from
 * the ABI itself — a wrong argument is a type error, not a runtime revert.
 */

export const goalTokenAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const;

export const goalManagerAbi = [
  {
    type: 'function',
    name: 'createGoal',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'description', type: 'string' },
      { name: 'targetMetric', type: 'uint256' },
      { name: 'deadline', type: 'uint64' },
      { name: 'stakeAmount', type: 'uint256' },
    ],
    outputs: [{ name: 'goalId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'verifySuccess',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'goalId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'markFailed',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'goalId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getGoal',
    stateMutability: 'view',
    inputs: [{ name: 'goalId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'user', type: 'address' },
          { name: 'stakeAmount', type: 'uint256' },
          { name: 'targetMetric', type: 'uint256' },
          { name: 'deadline', type: 'uint64' },
          { name: 'status', type: 'uint8' },
          { name: 'description', type: 'string' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'goalsOf',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256[]' }],
  },
  {
    type: 'function',
    name: 'quoteFailure',
    stateMutability: 'view',
    inputs: [{ name: 'goalId', type: 'uint256' }],
    outputs: [
      { name: 'fee', type: 'uint256' },
      { name: 'returned', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'platformFeeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint16' }],
  },
  {
    type: 'function',
    name: 'rewardRateBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint16' }],
  },
  {
    type: 'event',
    name: 'GoalCreated',
    inputs: [
      { name: 'goalId', type: 'uint256', indexed: true },
      { name: 'user', type: 'address', indexed: true },
      { name: 'stakeAmount', type: 'uint256', indexed: false },
      { name: 'targetMetric', type: 'uint256', indexed: false },
      { name: 'deadline', type: 'uint64', indexed: false },
      { name: 'description', type: 'string', indexed: false },
    ],
  },
] as const;

export const logAnchorAbi = [
  {
    type: 'function',
    name: 'anchorRoot',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'root', type: 'bytes32' },
      { name: 'periodStart', type: 'uint64' },
      { name: 'periodEnd', type: 'uint64' },
    ],
    outputs: [{ name: 'anchorId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'verifyLog',
    stateMutability: 'view',
    inputs: [
      { name: 'anchorId', type: 'uint256' },
      { name: 'proof', type: 'bytes32[]' },
      { name: 'leaf', type: 'bytes32' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

/** Mirrors GoalManager.Status. Index is the on-chain enum value. */
export const GOAL_STATUS = ['None', 'Active', 'Succeeded', 'Failed'] as const;
export type GoalStatus = (typeof GOAL_STATUS)[number];
