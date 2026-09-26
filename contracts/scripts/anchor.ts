import { ethers, network } from 'hardhat';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { computeRoot, proveLog, type LogEntry } from '../lib/merkle';

/**
 * Computes the Merkle root of a batch of logs and anchors it.
 *
 *   npx hardhat run scripts/anchor.ts --network sepolia
 *
 * Input is a JSON file of LogEntry objects — by default logs.json in this
 * directory, or set LOGS_FILE. Export it from the app's database; nothing here
 * talks to Postgres, deliberately, so this script can be run against a file
 * someone has inspected rather than against a live query they have not.
 *
 * Pass PROVE_LOG_ID to also print the proof for one entry, which is what you
 * would hand over to answer a challenge.
 */
async function main() {
  const file = process.env.LOGS_FILE ?? join(__dirname, 'logs.json');
  if (!existsSync(file)) {
    throw new Error(
      `No log file at ${file}. Write one, or set LOGS_FILE. Shape:\n` +
        `[{ "user": "0x…", "logId": "clog…", "kind": "set", "value": 5000, "timestamp": 1758412800 }]`,
    );
  }

  const entries = JSON.parse(readFileSync(file, 'utf8')) as LogEntry[];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Log file is empty — there is nothing to commit to.');
  }

  const root = computeRoot(entries);
  const timestamps = entries.map((e) => Number(e.timestamp));
  const periodStart = Number(process.env.PERIOD_START ?? Math.min(...timestamps));
  const periodEnd = Number(process.env.PERIOD_END ?? Math.max(...timestamps));

  console.log(`entries:     ${entries.length}`);
  console.log(`root:        ${root}`);
  console.log(`period:      ${new Date(periodStart * 1000).toISOString()} → ${new Date(periodEnd * 1000).toISOString()}`);

  if (process.env.PROVE_LOG_ID) {
    const proved = proveLog(entries, process.env.PROVE_LOG_ID);
    if (!proved) {
      console.log(`\nproof:       ${process.env.PROVE_LOG_ID} is NOT in this batch`);
    } else {
      console.log(`\nproof for    ${process.env.PROVE_LOG_ID}`);
      console.log(`  leaf:      ${proved.leaf}`);
      console.log(`  proof:     ${JSON.stringify(proved.proof)}`);
    }
  }

  if (process.env.DRY_RUN === '1') {
    console.log('\nDRY_RUN=1 — computed only, nothing anchored.');
    return;
  }

  const deploymentFile = join(__dirname, '..', 'deployments', `${network.name}.json`);
  if (!existsSync(deploymentFile)) {
    throw new Error(`No deployment record for ${network.name}. Run the deploy script first.`);
  }
  const { contracts } = JSON.parse(readFileSync(deploymentFile, 'utf8'));

  const anchor = await ethers.getContractAt('LogAnchor', contracts.LogAnchor);
  const tx = await anchor.anchorRoot(root, periodStart, periodEnd);
  console.log(`\nanchoring… ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`anchored in block ${receipt?.blockNumber}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exitCode = 1;
});
