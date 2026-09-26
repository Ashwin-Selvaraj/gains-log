import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';

const DAY = 24 * 60 * 60;
const CAP = ethers.parseEther('1000000');
const STAKE = ethers.parseEther('100');

async function deploy(feeBps = 1_000, rewardBps = 2_000) {
  const [admin, user, other, treasury] = await ethers.getSigners();

  const token = await ethers.deployContract('GoalToken', [
    'Goal Token',
    'GOAL',
    CAP,
    admin.address,
  ]);
  const manager = await ethers.deployContract('GoalManager', [
    await token.getAddress(),
    admin.address,
    treasury.address,
    feeBps,
    rewardBps,
  ]);

  const MINTER = await token.MINTER_ROLE();
  await token.grantRole(MINTER, await manager.getAddress());
  // The deployer mints the starting float, then hands the right back. Users
  // need tokens before they can stake any, and nothing else can create them.
  await token.grantRole(MINTER, admin.address);
  await token.mint(user.address, ethers.parseEther('1000'));
  await token.renounceRole(MINTER, admin.address);

  await token.connect(user).approve(await manager.getAddress(), ethers.MaxUint256);
  return { token, manager, admin, user, other, treasury };
}

async function createGoal(manager: any, user: any, deadlineIn = 7 * DAY) {
  const deadline = (await time.latest()) + deadlineIn;
  await manager.connect(user).createGoal('Squat 100kg', 100, deadline, STAKE);
  return { goalId: 1n, deadline };
}

describe('GoalManager', () => {
  describe('createGoal', () => {
    it('escrows the stake and records the goal as active', async () => {
      const { manager, token, user } = await deploy();
      const before = await token.balanceOf(user.address);

      await createGoal(manager, user);

      const goal = await manager.getGoal(1);
      expect(goal.user).to.equal(user.address);
      expect(goal.stakeAmount).to.equal(STAKE);
      expect(goal.status).to.equal(1); // Active
      expect(await token.balanceOf(user.address)).to.equal(before - STAKE);
      expect(await token.balanceOf(await manager.getAddress())).to.equal(STAKE);
    });

    it('emits GoalCreated with the description', async () => {
      const { manager, user } = await deploy();
      const deadline = (await time.latest()) + DAY;
      await expect(manager.connect(user).createGoal('Run 5k', 5, deadline, STAKE))
        .to.emit(manager, 'GoalCreated')
        .withArgs(1, user.address, STAKE, 5, deadline, 'Run 5k');
    });

    it('rejects a deadline in the past', async () => {
      const { manager, user } = await deploy();
      const past = (await time.latest()) - 1;
      await expect(
        manager.connect(user).createGoal('Too late', 1, past, STAKE),
      ).to.be.revertedWithCustomError(manager, 'DeadlineInPast');
    });

    it('rejects a zero stake', async () => {
      const { manager, user } = await deploy();
      const deadline = (await time.latest()) + DAY;
      await expect(
        manager.connect(user).createGoal('Free goal', 1, deadline, 0),
      ).to.be.revertedWithCustomError(manager, 'StakeIsZero');
    });
  });

  describe('verifySuccess', () => {
    it('returns the full stake and mints the reward', async () => {
      const { manager, token, admin, user } = await deploy(1_000, 2_000);
      await createGoal(manager, user);
      const before = await token.balanceOf(user.address);

      await manager.connect(admin).verifySuccess(1);

      const reward = (STAKE * 2_000n) / 10_000n;
      expect(await token.balanceOf(user.address)).to.equal(before + STAKE + reward);
      expect((await manager.getGoal(1)).status).to.equal(2); // Succeeded
    });

    it('emits StakeReturned, TokensMinted and GoalSucceeded', async () => {
      const { manager, admin, user } = await deploy(1_000, 2_000);
      await createGoal(manager, user);
      const reward = (STAKE * 2_000n) / 10_000n;

      const tx = manager.connect(admin).verifySuccess(1);
      await expect(tx).to.emit(manager, 'StakeReturned').withArgs(1, user.address, STAKE);
      await expect(tx).to.emit(manager, 'TokensMinted').withArgs(user.address, reward);
      await expect(tx).to.emit(manager, 'GoalSucceeded').withArgs(1, user.address, reward);
    });

    it('is verifier-only', async () => {
      const { manager, user, other } = await deploy();
      await createGoal(manager, user);
      await expect(manager.connect(other).verifySuccess(1)).to.be.revertedWithCustomError(
        manager,
        'AccessControlUnauthorizedAccount',
      );
    });

    it('cannot resolve the same goal twice', async () => {
      const { manager, admin, user } = await deploy();
      await createGoal(manager, user);
      await manager.connect(admin).verifySuccess(1);
      await expect(manager.connect(admin).verifySuccess(1)).to.be.revertedWithCustomError(
        manager,
        'GoalNotActive',
      );
    });
  });

  describe('markFailed', () => {
    it('takes the fee, returns the remainder, and burns nothing', async () => {
      const { manager, token, user, treasury } = await deploy(1_000); // 10%
      await createGoal(manager, user);
      const userBefore = await token.balanceOf(user.address);
      const supplyBefore = await token.totalSupply();

      await time.increase(8 * DAY);
      await manager.markFailed(1);

      const fee = (STAKE * 1_000n) / 10_000n;
      expect(await token.balanceOf(treasury.address)).to.equal(fee);
      expect(await token.balanceOf(user.address)).to.equal(userBefore + (STAKE - fee));
      // The point of the design: a failure must not destroy supply.
      expect(await token.totalSupply()).to.equal(supplyBefore);
    });

    it('emits FeeCollected, StakeReturned and GoalFailed', async () => {
      const { manager, user, treasury } = await deploy(1_000);
      await createGoal(manager, user);
      await time.increase(8 * DAY);

      const fee = (STAKE * 1_000n) / 10_000n;
      const tx = manager.markFailed(1);
      await expect(tx).to.emit(manager, 'FeeCollected').withArgs(1, treasury.address, fee);
      await expect(tx).to.emit(manager, 'StakeReturned').withArgs(1, user.address, STAKE - fee);
      await expect(tx).to.emit(manager, 'GoalFailed').withArgs(1, user.address, fee, STAKE - fee);
    });

    it('cannot be called by a stranger before the deadline', async () => {
      const { manager, user, other } = await deploy();
      await createGoal(manager, user);
      await expect(manager.connect(other).markFailed(1)).to.be.revertedWithCustomError(
        manager,
        'DeadlineNotReached',
      );
    });

    it('can be called by a verifier before the deadline', async () => {
      const { manager, admin, user } = await deploy();
      await createGoal(manager, user);
      await expect(manager.connect(admin).markFailed(1)).to.emit(manager, 'GoalFailed');
    });

    it('can be called by anyone once the deadline passes, so a stake is never stranded', async () => {
      const { manager, user, other } = await deploy();
      await createGoal(manager, user);
      await time.increase(8 * DAY);
      await expect(manager.connect(other).markFailed(1)).to.emit(manager, 'GoalFailed');
    });

    it('returns the whole stake when the fee is zero', async () => {
      const { manager, token, user, treasury } = await deploy(0);
      await createGoal(manager, user);
      const before = await token.balanceOf(user.address);
      await time.increase(8 * DAY);

      await manager.markFailed(1);

      expect(await token.balanceOf(user.address)).to.equal(before + STAKE);
      expect(await token.balanceOf(treasury.address)).to.equal(0);
    });
  });

  describe('fee configuration', () => {
    it('computes the fee at the configured rate', async () => {
      for (const bps of [0, 250, 1_000, 2_000]) {
        const { manager, user, treasury, token } = await deploy(bps);
        await createGoal(manager, user);
        await time.increase(8 * DAY);
        await manager.markFailed(1);
        expect(await token.balanceOf(treasury.address)).to.equal((STAKE * BigInt(bps)) / 10_000n);
      }
    });

    it('refuses a fee above the hard maximum, at deploy and at update', async () => {
      const [admin, , , treasury] = await ethers.getSigners();
      const token = await ethers.deployContract('GoalToken', ['G', 'G', CAP, admin.address]);

      await expect(
        ethers.deployContract('GoalManager', [
          await token.getAddress(),
          admin.address,
          treasury.address,
          2_001,
          0,
        ]),
      ).to.be.revertedWithCustomError({ interface: (await ethers.getContractFactory('GoalManager')).interface } as any, 'FeeAboveMaximum');

      const { manager, admin: a } = await deploy();
      await expect(manager.connect(a).setPlatformFeeBps(2_001)).to.be.revertedWithCustomError(
        manager,
        'FeeAboveMaximum',
      );
      await expect(manager.connect(a).setPlatformFeeBps(2_000)).to.emit(manager, 'FeeUpdated');
    });

    it('only an admin can change the fee', async () => {
      const { manager, other } = await deploy();
      await expect(manager.connect(other).setPlatformFeeBps(100)).to.be.revertedWithCustomError(
        manager,
        'AccessControlUnauthorizedAccount',
      );
    });

    it('quoteFailure matches what markFailed actually does', async () => {
      const { manager, token, user, treasury } = await deploy(750);
      await createGoal(manager, user);
      const [fee, returned] = await manager.quoteFailure(1);

      await time.increase(8 * DAY);
      await manager.markFailed(1);

      expect(await token.balanceOf(treasury.address)).to.equal(fee);
      expect(fee + returned).to.equal(STAKE);
    });
  });
});
