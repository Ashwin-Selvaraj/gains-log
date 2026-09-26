// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @notice The slice of a Uniswap-V2-style router that BuybackBurn actually uses.
 *
 * @dev Declared here rather than importing a router package so this project
 * depends on an interface it controls, not on a DEX's release cycle. Any router
 * exposing this shape can be pointed at — which is also what makes the buyback
 * testable against a mock instead of against Sepolia's largely empty pools.
 */
interface ISwapRouter {
    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable returns (uint256[] memory amounts);

    function WETH() external view returns (address);
}
