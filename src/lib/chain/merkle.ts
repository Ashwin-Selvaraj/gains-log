import { StandardMerkleTree } from '@openzeppelin/merkle-tree';

/**
 * How a batch of workout and meal logs becomes one 32-byte commitment.
 *
 * A deliberate copy of contracts/lib/merkle.ts, which is the canonical
 * definition. The two live in separate npm projects on purpose — the app should
 * not depend on Hardhat's tree — so this cannot simply import it.
 *
 * The copy is the risk: a change there that is not mirrored here produces
 * proofs that fail with no useful error, because MerkleProof.verify returns a
 * silent `false` rather than throwing. KNOWN_VECTOR is the guard. Both sides
 * assert that the same input hashes to the same root, so drift fails a test
 * instead of surfacing months later as a challenge that cannot be answered.
 *
 * If that assertion ever fails: fix whichever side drifted. Do not re-pin the
 * vector to make it pass — that would only make the two agree on being wrong.
 */

/**
 * Leaf shape, in order.
 *
 * `logId` is the database's own cuid, so a revealed log can be tied back to the
 * exact row. `value` is a single number rather than the whole record: the point
 * of anchoring is to commit to what was claimed, and a set is fairly summarised
 * by its volume, a meal by its calories. Anything richer belongs in the reveal,
 * not the leaf.
 */
export const LOG_LEAF_TYPES = ['address', 'string', 'string', 'uint256', 'uint64'] as const;

export type LogEntry = {
  /** The wallet the logs belong to — binds a batch to one person. */
  user: string;
  /** Database id of the row (cuid). */
  logId: string;
  /** "set" | "meal" — what kind of record this is. */
  kind: string;
  /** Volume in kg for a set, calories for a meal. Integers only. */
  value: bigint | number;
  /** Unix seconds. */
  timestamp: bigint | number;
};

type LeafTuple = [string, string, string, string, string];

/** Normalised to strings so a number and a bigint of equal value hash alike. */
function toTuple(entry: LogEntry): LeafTuple {
  return [
    entry.user.toLowerCase(),
    entry.logId,
    entry.kind,
    BigInt(entry.value).toString(),
    BigInt(entry.timestamp).toString(),
  ];
}

/**
 * Builds the tree for a batch.
 *
 * Entries are sorted by logId first, so the same set of logs always produces
 * the same root regardless of the order the database happened to return them.
 * Without this an identical week could anchor to two different roots and the
 * mismatch would look like tampering.
 */
export function buildLogTree(entries: LogEntry[]) {
  const sorted = [...entries].sort((a, b) => (a.logId < b.logId ? -1 : a.logId > b.logId ? 1 : 0));
  return StandardMerkleTree.of(sorted.map(toTuple), LOG_LEAF_TYPES as unknown as string[]);
}

export function computeRoot(entries: LogEntry[]): string {
  return buildLogTree(entries).root;
}

/**
 * The proof for one log, plus the leaf hash the contract checks it against.
 * Returns null when the entry is not in the batch, rather than throwing — a
 * caller asking "is this log in that week" deserves an answer, not an exception.
 */
export function proveLog(
  entries: LogEntry[],
  logId: string,
): { leaf: string; proof: string[]; value: LeafTuple } | null {
  const tree = buildLogTree(entries);
  for (const [i, value] of tree.entries()) {
    if (value[1] === logId) {
      return {
        leaf: tree.leafHash(value),
        proof: tree.getProof(i),
        value: value as LeafTuple,
      };
    }
  }
  return null;
}

/**
 * A fixed input and its root, asserted by tests on both sides of the project.
 *
 * If the encoding is ever changed — a field added, an order swapped, a
 * lowercase dropped — this vector stops matching and the test fails loudly,
 * instead of every future proof failing quietly.
 */
export const KNOWN_VECTOR: { entries: LogEntry[]; root: string } = {
  entries: [
    {
      user: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      logId: 'clog000000000000000000001',
      kind: 'set',
      value: 5000,
      timestamp: 1758412800,
    },
    {
      user: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      logId: 'clog000000000000000000002',
      kind: 'meal',
      value: 650,
      timestamp: 1758416400,
    },
    {
      user: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      logId: 'clog000000000000000000003',
      kind: 'set',
      value: 4200,
      timestamp: 1758499200,
    },
  ],
  root: '0x928fccb69992520e3eb286853c4e3b6f14a916b40679cc19c45a9fe5c95b6e4a',
};
