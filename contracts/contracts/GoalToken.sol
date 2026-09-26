// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Capped} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Capped.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title GoalToken
 * @notice The reward token. Capped supply, minted only by GoalManager.
 *
 * @dev Two deliberate choices worth stating.
 *
 * Minting is behind a role rather than an owner address, so the right to mint
 * can be given to GoalManager and to nothing else — including the deployer,
 * who keeps only the ability to grant and revoke. An owner-based token would
 * leave whoever holds the key able to mint to themselves at any time, which is
 * precisely the thing a capped supply is meant to make impossible.
 *
 * The cap is enforced by ERC20Capped's `_update` hook, so it holds for every
 * mint path that exists now or is added later — it cannot be forgotten at a
 * call site.
 */
contract GoalToken is ERC20Capped, ERC20Burnable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    error MintToZeroAddress();

    constructor(
        string memory name_,
        string memory symbol_,
        uint256 cap_,
        address admin_
    ) ERC20(name_, symbol_) ERC20Capped(cap_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
    }

    /**
     * @notice Mints reward tokens. Reverts past the cap.
     * @dev Callable only by MINTER_ROLE, which is granted to GoalManager after
     * deployment. Nothing here decides *whether* a reward is deserved; that is
     * GoalManager's job, and keeping the decision there means this contract has
     * one rule to audit rather than two.
     */
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        if (to == address(0)) revert MintToZeroAddress();
        _mint(to, amount);
    }

    /**
     * @notice How much more may ever be minted.
     * @dev GoalManager reads this to trim a reward that would otherwise revert
     * against the cap — a successful goal should still return its stake even on
     * the day the last token is minted.
     */
    function remainingSupply() external view returns (uint256) {
        return cap() - totalSupply();
    }

    // Both parents write `_update`; Solidity requires the override to be
    // explicit about which implementation runs.
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20, ERC20Capped) {
        super._update(from, to, value);
    }
}
