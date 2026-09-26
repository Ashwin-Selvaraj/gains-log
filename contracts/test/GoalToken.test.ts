import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';

const DAY = 24 * 60 * 60;

describe('GoalToken', () => {
  async function deployToken(cap: bigint) {
    const [admin, user] = await ethers.getSigners();
    const token = await ethers.deployContract('GoalToken', ['Goal Token', 'GOAL', cap, admin.address]);
    return { token, admin, user };
  }

  it('reports the cap and starts empty', async () => {
    const cap = ethers.parseEther('1000');
    const { token } = await deployToken(cap);
    expect(await token.cap()).to.equal(cap);
    expect(await token.totalSupply()).to.equal(0);
    expect(await token.remainingSupply()).to.equal(cap);
  });

  it('refuses to mint without the role, including from the admin', async () => {
    const { token, admin, user } = await deployToken(ethers.parseEther('1000'));
    // The admin can *grant* minting but cannot mint — that separation is the
    // whole reason minting is a role rather than an ownership check.
    await expect(token.connect(admin).mint(user.address, 1)).to.be.revertedWithCustomError(
      token,
      'AccessControlUnauthorizedAccount',
    );
  });

  it('enforces the cap exactly', async () => {
    const cap = ethers.parseEther('100');
    const { token, admin, user } = await deployToken(cap);
    await token.grantRole(await token.MINTER_ROLE(), admin.address);

    await token.mint(user.address, ethers.parseEther('99'));
    expect(await token.remainingSupply()).to.equal(ethers.parseEther('1'));

    await token.mint(user.address, ethers.parseEther('1'));
    expect(await token.totalSupply()).to.equal(cap);
    expect(await token.remainingSupply()).to.equal(0);

    await expect(token.mint(user.address, 1)).to.be.revertedWithCustomError(
      token,
      'ERC20ExceededCap',
    );
  });

  it('refuses to mint to the zero address', async () => {
    const { token, admin } = await deployToken(ethers.parseEther('100'));
    await token.grantRole(await token.MINTER_ROLE(), admin.address);
    await expect(token.mint(ethers.ZeroAddress, 1)).to.be.revertedWithCustomError(
      token,
      'MintToZeroAddress',
    );
  });

  it('frees headroom again when tokens are burned', async () => {
    const cap = ethers.parseEther('100');
    const { token, admin, user } = await deployToken(cap);
    await token.grantRole(await token.MINTER_ROLE(), admin.address);
    await token.mint(user.address, cap);
    expect(await token.remainingSupply()).to.equal(0);

    await token.connect(user).burn(ethers.parseEther('10'));
    expect(await token.remainingSupply()).to.equal(ethers.parseEther('10'));
  });

  describe('interaction with GoalManager at the cap', () => {
    /**
     * The case the reward-trimming exists for: a goal succeeds on the day the
     * last token has been minted. The stake must still come back.
     */
    it('still returns the stake when no headroom is left, minting a reduced reward', async () => {
      const [admin, user, , treasury] = await ethers.getSigners();
      const cap = ethers.parseEther('1000');
      const token = await ethers.deployContract('GoalToken', ['G', 'GOAL', cap, admin.address]);
      const manager = await ethers.deployContract('GoalManager', [
        await token.getAddress(),
        admin.address,
        treasury.address,
        1_000,
        2_000,
      ]);

      const MINTER = await token.MINTER_ROLE();
      await token.grantRole(MINTER, await manager.getAddress());
      await token.grantRole(MINTER, admin.address);
      // Mint right up to the cap, so there is no headroom for any reward.
      await token.mint(user.address, cap);
      await token.renounceRole(MINTER, admin.address);
      expect(await token.remainingSupply()).to.equal(0);

      const stake = ethers.parseEther('100');
      await token.connect(user).approve(await manager.getAddress(), stake);
      const deadline = (await time.latest()) + DAY;
      await manager.connect(user).createGoal('At the cap', 1, deadline, stake);

      const before = await token.balanceOf(user.address);
      await expect(manager.connect(admin).verifySuccess(1))
        .to.emit(manager, 'GoalSucceeded')
        .withArgs(1, user.address, 0); // reward trimmed to zero, not reverted

      expect(await token.balanceOf(user.address)).to.equal(before + stake);
      expect(await token.totalSupply()).to.equal(cap);
    });

    it('mints only the headroom that remains when the reward would overshoot', async () => {
      const [admin, user, , treasury] = await ethers.getSigners();
      const cap = ethers.parseEther('1000');
      const token = await ethers.deployContract('GoalToken', ['G', 'GOAL', cap, admin.address]);
      const manager = await ethers.deployContract('GoalManager', [
        await token.getAddress(),
        admin.address,
        treasury.address,
        1_000,
        2_000, // 20% of a 100 stake = 20 reward
      ]);

      const MINTER = await token.MINTER_ROLE();
      await token.grantRole(MINTER, await manager.getAddress());
      await token.grantRole(MINTER, admin.address);
      // Leave 5 tokens of headroom against a 20-token reward.
      await token.mint(user.address, cap - ethers.parseEther('5'));
      await token.renounceRole(MINTER, admin.address);

      const stake = ethers.parseEther('100');
      await token.connect(user).approve(await manager.getAddress(), stake);
      const deadline = (await time.latest()) + DAY;
      await manager.connect(user).createGoal('Near the cap', 1, deadline, stake);

      await expect(manager.connect(admin).verifySuccess(1))
        .to.emit(manager, 'TokensMinted')
        .withArgs(user.address, ethers.parseEther('5'));

      expect(await token.totalSupply()).to.equal(cap);
    });
  });
});
