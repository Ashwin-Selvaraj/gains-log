// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {GoalToken} from "./GoalToken.sol";

/**
 * @title GoalManager
 * @notice Stake tokens against a goal; get them back on success, minus a fee
 *         on failure.
 *
 * @dev The deliberate design choice here is what does *not* happen on failure:
 * the stake is not burned. A failed goal returns the stake minus a capped
 * platform fee, because the point of the stake is to be a commitment device,
 * not a punishment — and because burning user funds makes the token's supply
 * depend on people failing, which is a perverse thing to build an economy on.
 * Deflation is handled separately and deliberately by BuybackBurn, funded by
 * platform revenue rather than by anyone's bad week.
 *
 * Verification is a role, not an oracle. In this deployment the role is held by
 * the application server, which checks the goal's target against the workout
 * and meal data it already stores before calling `verifySuccess`. That is why
 * the anchoring in LogAnchor matters: it lets the server commit publicly to the
 * data it judged, so a verdict can be challenged later against a record that
 * could not have been rewritten after the fact.
 */
contract GoalManager is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    enum Status {
        None,
        Active,
        Succeeded,
        Failed
    }

    struct Goal {
        address user;
        uint256 stakeAmount;
        uint256 targetMetric;
        uint64 deadline;
        Status status;
        string description;
    }

    /// @notice Ceiling on the configurable fee, fixed at deploy and immutable.
    /// Without it, "configurable" means an admin can set 100% and take every
    /// stake — a promise that the fee is bounded is only worth anything if the
    /// contract, not the operator, enforces it.
    uint16 public constant MAX_FEE_BPS = 2_000; // 20%
    uint16 public constant BPS_DENOMINATOR = 10_000;

    GoalToken public immutable token;

    address public treasury;
    uint16 public platformFeeBps;
    /// @notice Reward on success, in basis points of the stake.
    uint16 public rewardRateBps;

    uint256 public nextGoalId = 1;
    mapping(uint256 => Goal) private _goals;
    mapping(address => uint256[]) private _goalsByUser;

    event GoalCreated(
        uint256 indexed goalId,
        address indexed user,
        uint256 stakeAmount,
        uint256 targetMetric,
        uint64 deadline,
        string description
    );
    event GoalSucceeded(uint256 indexed goalId, address indexed user, uint256 reward);
    event GoalFailed(uint256 indexed goalId, address indexed user, uint256 fee, uint256 returned);
    event TokensMinted(address indexed to, uint256 amount);
    event StakeReturned(uint256 indexed goalId, address indexed user, uint256 amount);
    event FeeCollected(uint256 indexed goalId, address indexed treasury, uint256 amount);
    event FeeUpdated(uint16 previousBps, uint16 newBps);
    event RewardRateUpdated(uint16 previousBps, uint16 newBps);
    event TreasuryUpdated(address previous, address next);

    error DeadlineInPast();
    error StakeIsZero();
    error GoalNotActive();
    error NotYourGoal();
    error DeadlineNotReached();
    error FeeAboveMaximum();
    error ZeroAddress();

    constructor(
        GoalToken token_,
        address admin_,
        address treasury_,
        uint16 platformFeeBps_,
        uint16 rewardRateBps_
    ) {
        if (address(token_) == address(0) || admin_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        if (platformFeeBps_ > MAX_FEE_BPS) revert FeeAboveMaximum();

        token = token_;
        treasury = treasury_;
        platformFeeBps = platformFeeBps_;
        rewardRateBps = rewardRateBps_;

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(VERIFIER_ROLE, admin_);
    }

    // ─── Goals ──────────────────────────────────────────────────────────────

    /**
     * @notice Stakes `stakeAmount` against a goal and records it as active.
     * @dev The caller must have approved this contract for `stakeAmount` first.
     * `targetMetric` is left as a bare number on purpose — what it counts (kg
     * lifted, sessions trained, grams of protein) is the application's business,
     * and encoding a unit here would mean a contract migration every time a new
     * kind of goal is wanted.
     */
    function createGoal(
        string calldata description,
        uint256 targetMetric,
        uint64 deadline,
        uint256 stakeAmount
    ) external nonReentrant returns (uint256 goalId) {
        if (deadline <= block.timestamp) revert DeadlineInPast();
        if (stakeAmount == 0) revert StakeIsZero();

        goalId = nextGoalId++;
        _goals[goalId] = Goal({
            user: msg.sender,
            stakeAmount: stakeAmount,
            targetMetric: targetMetric,
            deadline: deadline,
            status: Status.Active,
            description: description
        });
        _goalsByUser[msg.sender].push(goalId);

        // Interaction last: state is already consistent before any token
        // contract is given control.
        IERC20(address(token)).safeTransferFrom(msg.sender, address(this), stakeAmount);

        emit GoalCreated(goalId, msg.sender, stakeAmount, targetMetric, deadline, description);
    }

    /**
     * @notice Marks a goal succeeded: returns the full stake and mints a reward.
     * @dev Verifier-only. The reward is trimmed to whatever headroom the cap
     * still allows rather than reverting — on the day the last token is minted,
     * a person who did the work should still get their stake back. A reward of
     * zero is a worse outcome than a failed transaction only if you believe the
     * reward matters more than the stake, and it does not.
     */
    function verifySuccess(uint256 goalId) external onlyRole(VERIFIER_ROLE) nonReentrant {
        Goal storage goal = _goals[goalId];
        if (goal.status != Status.Active) revert GoalNotActive();

        goal.status = Status.Succeeded;

        uint256 stake = goal.stakeAmount;
        address user = goal.user;

        uint256 reward = (stake * rewardRateBps) / BPS_DENOMINATOR;
        uint256 headroom = token.remainingSupply();
        if (reward > headroom) reward = headroom;

        IERC20(address(token)).safeTransfer(user, stake);
        emit StakeReturned(goalId, user, stake);

        if (reward > 0) {
            token.mint(user, reward);
            emit TokensMinted(user, reward);
        }

        emit GoalSucceeded(goalId, user, reward);
    }

    /**
     * @notice Marks a goal failed: takes the platform fee, returns the rest.
     * @dev Callable by a verifier at any time, or by anyone once the deadline
     * has passed. The open path after the deadline matters — without it a stake
     * could be stranded indefinitely by a verifier who simply stops responding,
     * and "we hold your tokens until we get round to it" is not a property
     * anyone should have to trust.
     */
    function markFailed(uint256 goalId) external nonReentrant {
        Goal storage goal = _goals[goalId];
        if (goal.status != Status.Active) revert GoalNotActive();
        if (block.timestamp <= goal.deadline && !hasRole(VERIFIER_ROLE, msg.sender)) {
            revert DeadlineNotReached();
        }

        goal.status = Status.Failed;

        uint256 stake = goal.stakeAmount;
        address user = goal.user;
        uint256 fee = (stake * platformFeeBps) / BPS_DENOMINATOR;
        uint256 returned = stake - fee;

        if (fee > 0) {
            IERC20(address(token)).safeTransfer(treasury, fee);
            emit FeeCollected(goalId, treasury, fee);
        }
        if (returned > 0) {
            IERC20(address(token)).safeTransfer(user, returned);
            emit StakeReturned(goalId, user, returned);
        }

        emit GoalFailed(goalId, user, fee, returned);
    }

    // ─── Views ──────────────────────────────────────────────────────────────

    function getGoal(uint256 goalId) external view returns (Goal memory) {
        return _goals[goalId];
    }

    function goalsOf(address user) external view returns (uint256[] memory) {
        return _goalsByUser[user];
    }

    /// @notice What a failure would cost and return, without having to fail first.
    function quoteFailure(uint256 goalId) external view returns (uint256 fee, uint256 returned) {
        uint256 stake = _goals[goalId].stakeAmount;
        fee = (stake * platformFeeBps) / BPS_DENOMINATOR;
        returned = stake - fee;
    }

    // ─── Admin ──────────────────────────────────────────────────────────────

    function setPlatformFeeBps(uint16 newBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newBps > MAX_FEE_BPS) revert FeeAboveMaximum();
        emit FeeUpdated(platformFeeBps, newBps);
        platformFeeBps = newBps;
    }

    function setRewardRateBps(uint16 newBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        emit RewardRateUpdated(rewardRateBps, newBps);
        rewardRateBps = newBps;
    }

    function setTreasury(address next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (next == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, next);
        treasury = next;
    }
}
