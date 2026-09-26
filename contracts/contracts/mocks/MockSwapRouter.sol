// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapRouter} from "../interfaces/ISwapRouter.sol";

/**
 * @notice A router stand-in for tests: swaps ETH for tokens at a fixed rate.
 *
 * @dev Exists because Sepolia's DEX pools hold little or no real liquidity, so
 * a test pointed at a live testnet router would prove nothing about the buyback
 * path — it would just fail for reasons unrelated to the code under test.
 * Pre-fund this with GoalToken and it behaves like a pool deep enough to quote.
 */
contract MockSwapRouter is ISwapRouter {
    uint256 public rate; // tokens out per 1 wei in
    address public weth;

    constructor(uint256 rate_, address weth_) {
        rate = rate_;
        weth = weth_;
    }

    function WETH() external view returns (address) {
        return weth;
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts) {
        require(block.timestamp <= deadline, "MockSwapRouter: expired");
        uint256 out = msg.value * rate;
        require(out >= amountOutMin, "MockSwapRouter: insufficient output");

        IERC20(path[path.length - 1]).transfer(to, out);

        amounts = new uint256[](2);
        amounts[0] = msg.value;
        amounts[1] = out;
    }
}
