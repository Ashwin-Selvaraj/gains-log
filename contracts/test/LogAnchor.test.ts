import { expect } from 'chai';
import { ethers } from 'hardhat';
import { buildLogTree, computeRoot, proveLog, KNOWN_VECTOR, type LogEntry } from '../lib/merkle';

describe('LogAnchor', () => {
  async function deployAnchor() {
    const [admin, other] = await ethers.getSigners();
    const anchor = await ethers.deployContract('LogAnchor', [admin.address]);
    return { anchor, admin, other };
  }

  function sampleLogs(user: string, n: number): LogEntry[] {
    return Array.from({ length: n }, (_, i) => ({
      user,
      logId: `clog${String(i).padStart(21, '0')}`,
      kind: i % 2 === 0 ? 'set' : 'meal',
      value: 1000 + i * 37,
      timestamp: 1758412800 + i * 3600,
    }));
  }

  it('anchors a root and records the period', async () => {
    const { anchor, admin } = await deployAnchor();
    const root = computeRoot(sampleLogs(admin.address, 10));

    await expect(anchor.anchorRoot(root, 1758412800, 1759017600))
      .to.emit(anchor, 'RootAnchored')
      .withArgs(1, root, 1758412800, 1759017600, admin.address);

    const stored = await anchor.getAnchor(1);
    expect(stored.root).to.equal(root);
    expect(stored.periodStart).to.equal(1758412800);
    expect(stored.periodEnd).to.equal(1759017600);
  });

  it('is anchor-role only', async () => {
    const { anchor, other } = await deployAnchor();
    await expect(
      anchor.connect(other).anchorRoot(ethers.keccak256('0x01'), 0, 1),
    ).to.be.revertedWithCustomError(anchor, 'AccessControlUnauthorizedAccount');
  });

  it('rejects an empty root and a backwards period', async () => {
    const { anchor } = await deployAnchor();
    await expect(anchor.anchorRoot(ethers.ZeroHash, 0, 1)).to.be.revertedWithCustomError(
      anchor,
      'EmptyRoot',
    );
    await expect(
      anchor.anchorRoot(ethers.keccak256('0x01'), 100, 99),
    ).to.be.revertedWithCustomError(anchor, 'InvalidPeriod');
  });

  describe('proof verification', () => {
    it('verifies a revealed log against the anchored root', async () => {
      const { anchor, admin } = await deployAnchor();
      const logs = sampleLogs(admin.address, 16);
      await anchor.anchorRoot(computeRoot(logs), 0, 1);

      const target = logs[7];
      const proved = proveLog(logs, target.logId);
      expect(proved).to.not.equal(null);

      expect(await anchor.verifyLog(1, proved!.proof, proved!.leaf)).to.equal(true);
    });

    it('rejects a log that was never in the batch', async () => {
      const { anchor, admin } = await deployAnchor();
      const logs = sampleLogs(admin.address, 8);
      await anchor.anchorRoot(computeRoot(logs), 0, 1);

      // A log invented afterwards: real proof shape, wrong tree.
      const forged = [...logs, { ...logs[0], logId: 'clog-invented', value: 99999 }];
      const proved = proveLog(forged, 'clog-invented')!;

      expect(await anchor.verifyLog(1, proved.proof, proved.leaf)).to.equal(false);
    });

    it('rejects a tampered value with an otherwise valid proof', async () => {
      const { anchor, admin } = await deployAnchor();
      const logs = sampleLogs(admin.address, 8);
      await anchor.anchorRoot(computeRoot(logs), 0, 1);

      const honest = proveLog(logs, logs[3].logId)!;
      // Same position in the tree, but claim a bigger lift than was anchored.
      const tampered = buildLogTree([
        ...logs.slice(0, 3),
        { ...logs[3], value: 999999 },
        ...logs.slice(4),
      ]);
      const tamperedLeaf = tampered.leafHash([
        logs[3].user.toLowerCase(),
        logs[3].logId,
        logs[3].kind,
        '999999',
        String(logs[3].timestamp),
      ]);

      expect(await anchor.verifyLog(1, honest.proof, tamperedLeaf)).to.equal(false);
    });

    it('reverts for an anchor that does not exist', async () => {
      const { anchor } = await deployAnchor();
      await expect(anchor.verifyLog(42, [], ethers.ZeroHash)).to.be.revertedWithCustomError(
        anchor,
        'UnknownAnchor',
      );
    });

    it('handles a single-log batch, where the proof is empty', async () => {
      const { anchor, admin } = await deployAnchor();
      const logs = sampleLogs(admin.address, 1);
      await anchor.anchorRoot(computeRoot(logs), 0, 1);

      const proved = proveLog(logs, logs[0].logId)!;
      expect(proved.proof).to.have.length(0);
      expect(await anchor.verifyLog(1, proved.proof, proved.leaf)).to.equal(true);
    });
  });

  describe('leaf encoding', () => {
    /**
     * Pins the encoding. If this fails, the PWA's copy and this one have
     * drifted, and every proof produced by one will be rejected by the other.
     */
    it('matches the known vector', () => {
      expect(computeRoot(KNOWN_VECTOR.entries)).to.equal(KNOWN_VECTOR.root);
    });

    it('is order-independent — the same logs always give the same root', () => {
      const logs = sampleLogs('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 12);
      const shuffled = [...logs].reverse();
      expect(computeRoot(shuffled)).to.equal(computeRoot(logs));
    });
  });
});
