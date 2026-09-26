/**
 * Asserts the app's leaf encoding still produces the canonical root.
 *
 *   node --experimental-strip-types scripts/check-merkle-parity.ts
 *
 * src/lib/chain/merkle.ts is a copy of contracts/lib/merkle.ts — they cannot
 * import each other, because the two live in separate npm projects on purpose.
 * Each side pins the same literal root, so a change to either encoding fails
 * that side's check. Without this, drift shows up as proofs that verify as a
 * silent `false` on-chain, months later, with nothing to point at.
 */
import { computeRoot, KNOWN_VECTOR, proveLog } from '../src/lib/chain/merkle.ts';

const actual = computeRoot(KNOWN_VECTOR.entries);

if (actual !== KNOWN_VECTOR.root) {
  console.error('Merkle leaf encoding has drifted.\n');
  console.error(`  expected ${KNOWN_VECTOR.root}`);
  console.error(`  actual   ${actual}\n`);
  console.error('Fix whichever copy changed — src/lib/chain/merkle.ts or');
  console.error('contracts/lib/merkle.ts. Do not re-pin the vector to make this');
  console.error('pass; that only makes both sides agree on being wrong.');
  process.exit(1);
}

// A proof from this side must also be shaped the way the contract expects.
const proved = proveLog(KNOWN_VECTOR.entries, KNOWN_VECTOR.entries[1].logId);
if (!proved || proved.proof.length === 0) {
  console.error('Proof generation is broken: no proof for a known entry.');
  process.exit(1);
}

console.log(`merkle parity OK — root ${actual}`);
console.log(`proof for ${KNOWN_VECTOR.entries[1].logId}: ${proved.proof.length} nodes`);
