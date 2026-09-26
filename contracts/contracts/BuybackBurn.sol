// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";

/**
 * @title BuybackBurn
 * @notice Spends platform revenue buying GoalToken on a DEX and burns it.
 *
 * @dev This is the only deflationary mechanism, and that is the point. Supply
 * shrinks when the platform earns, never when a user fails — failure returns
 * the stake minus a fee (see GoalManager), so nobody's shortfall is quietly
 * feeding the token's scarcity.
 *
 * Two revenue shapes, because the platform genuinely has two.
 *
 * `buybackAndBurn` is the real buyback: revenue arriving as ETH (subscriptions,
 * anything sold off-platform) is spent on the open market and destroyed. It
 * moves the price because it is an actual purchase.
 *
 * `burnCollectedFees` covers the other stream. GoalManager's failure fee is
 * already denominated in GoalToken, so there is nothing to buy — swapping it
 * for itself would be theatre. Those tokens are burned directly, and the
 * separate event keeps the two honestly distinguishable to anyone reading the
 * chain: one is demand, the other is only supply reduction.
 *
 * `minTokensOut` is required rather than defaulted, because a swap submitted
 * with no floor is an invitation to be sandwiched — on a thin pool the entire
 * buyback can be extracted by whoever sees it first.
 */
contract BuybackBurn is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant TREASURER_ROLE = keccak256("TREASURER_ROLE");

    ERC20Burnable public immutable token;
    ISwapRouter public router;

    event TokensBurned(uint256 amount, uint256 ethSpent, address indexed caller);
    event RouterUpdated(address previous, address next);
    event RevenueReceived(address indexed from, uint256 amount);

    error NothingToSpend();
    error NothingToBurn();
    error ZeroAddress();
    error SwapProducedNothing();

    constructor(ERC20Burnable token_, ISwapRouter router_, address admin_) {
        if (address(token_) == address(0) || admin_ == address(0)) revert ZeroAddress();
        token = token_;
        router = router_;
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(TREASURER_ROLE, admin_);
    }

    /// @notice Accepts revenue in ETH, to be spent by a later buyback.
    receive() external payable {
        emit RevenueReceived(msg.sender, msg.value);
    }

    /**
     * @notice Spends `ethAmount` of held revenue on GoalToken and burns it.
     * @param ethAmount How much of the balance to spend; 0 spends all of it.
     * @param minTokensOut Slippage floor. Quote off-chain and set deliberately.
     */
    function buybackAndBurn(
        uint256 ethAmount,
        uint256 minTokensOut,
        uint256 deadline
    ) external onlyRole(TREASURER_ROLE) nonReentrant returns (uint256 burned) {
        uint256 spend = ethAmount == 0 ? address(this).balance : ethAmount;
        if (spend == 0 || spend > address(this).balance) revert NothingToSpend();

        address[] memory path = new address[](2);
        path[0] = router.WETH();
        path[1] = address(token);

        // Swapped to this contract rather than straight to address(0): the
        // burn has to come from a balance this contract controls, and routing
        // to the zero address would simply lose the tokens without reducing
        // totalSupply, which is not the same thing at all.
        router.swapExactETHForTokens{value: spend}(minTokensOut, path, address(this), deadline);

        burned = token.balanceOf(address(this));
        if (burned == 0) revert SwapProducedNothing();

        token.burn(burned);
        emit TokensBurned(burned, spend, msg.sender);
    }

    /**
     * @notice Burns GoalToken already held here — fees swept from the treasury.
     * @dev No swap, because the fee is already the token being burned.
     */
    function burnCollectedFees(uint256 amount) external onlyRole(TREASURER_ROLE) nonReentrant {
        uint256 held = token.balanceOf(address(this));
        uint256 toBurn = amount == 0 ? held : amount;
        if (toBurn == 0 || toBurn > held) revert NothingToBurn();

        token.burn(toBurn);
        emit TokensBurned(toBurn, 0, msg.sender);
    }

    function setRouter(ISwapRouter next) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(next) == address(0)) revert ZeroAddress();
        emit RouterUpdated(address(router), address(next));
        router = next;
    }
}
