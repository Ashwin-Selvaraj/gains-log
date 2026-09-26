// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title LogAnchor
 * @notice Commits to a batch of off-chain logs with a single hash.
 *
 * @dev No workout or meal ever goes on-chain. A week of logs is hashed into one
 * Merkle root off-chain and only that root is anchored here — 32 bytes for a
 * period of any size, and nothing legible to anyone reading the chain. Putting
 * the logs themselves on a public ledger would be both ruinously expensive and
 * a permanent, irrevocable publication of what somebody ate.
 *
 * What the anchor buys is narrow and worth stating precisely: it proves the
 * data existed in exactly this form at the time it was anchored. It does not
 * prove the data is true. Someone can still log a workout they never did — but
 * they cannot quietly rewrite last month's logs to justify a goal they are
 * about to claim, because the root committing to them is already on-chain.
 *
 * Challenge flow: reveal the single log plus its Merkle proof, and anyone can
 * check it against the anchored root without seeing the rest of the batch.
 */
contract LogAnchor is AccessControl {
    bytes32 public constant ANCHOR_ROLE = keccak256("ANCHOR_ROLE");

    struct Anchor {
        bytes32 root;
        uint64 periodStart;
        uint64 periodEnd;
        uint64 anchoredAt;
        address anchoredBy;
    }

    uint256 public nextAnchorId = 1;
    mapping(uint256 => Anchor) private _anchors;

    event RootAnchored(
        uint256 indexed anchorId,
        bytes32 indexed root,
        uint64 periodStart,
        uint64 periodEnd,
        address indexed anchoredBy
    );

    error EmptyRoot();
    error InvalidPeriod();
    error UnknownAnchor();

    constructor(address admin_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(ANCHOR_ROLE, admin_);
    }

    /**
     * @notice Anchors the Merkle root of one period's logs.
     * @dev Anchors are append-only and never updated. An anchor that could be
     * revised is not a commitment to anything.
     */
    function anchorRoot(
        bytes32 root,
        uint64 periodStart,
        uint64 periodEnd
    ) external onlyRole(ANCHOR_ROLE) returns (uint256 anchorId) {
        if (root == bytes32(0)) revert EmptyRoot();
        if (periodEnd < periodStart) revert InvalidPeriod();

        anchorId = nextAnchorId++;
        _anchors[anchorId] = Anchor({
            root: root,
            periodStart: periodStart,
            periodEnd: periodEnd,
            anchoredAt: uint64(block.timestamp),
            anchoredBy: msg.sender
        });

        emit RootAnchored(anchorId, root, periodStart, periodEnd, msg.sender);
    }

    /**
     * @notice Checks one revealed log against an anchored root.
     * @param leaf The leaf hash for the log, built off-chain by OpenZeppelin's
     * merkle-tree library. That library double-hashes the ABI-encoded values so
     * no internal node can ever be passed off as a leaf — which is the reason
     * to use it rather than hand-rolling keccak256 over the values, where that
     * second-preimage gap is easy to leave open without noticing.
     */
    function verifyLog(
        uint256 anchorId,
        bytes32[] calldata proof,
        bytes32 leaf
    ) external view returns (bool) {
        bytes32 root = _anchors[anchorId].root;
        if (root == bytes32(0)) revert UnknownAnchor();
        return MerkleProof.verify(proof, root, leaf);
    }

    function getAnchor(uint256 anchorId) external view returns (Anchor memory) {
        return _anchors[anchorId];
    }
}
