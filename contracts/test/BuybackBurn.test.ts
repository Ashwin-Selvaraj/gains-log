import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';

const CAP = ethers.parseEther('1000000');
/** Tokens handed back per wei by the mock pool. */
const RATE = 1000n;

describe('BuybackBurn', () => {
  async function deploy() {
    const [admin, other] = await ethers.getSigners();

    const token = await ethers.deployContract('GoalToken', ['G', 'GOAL', CAP, admin.address]);
    const weth = ethers.Wallet.createRandom().address;
    const router = await ethers.deployContract('MockSwapRouter', [RATE, weth]);
    const buyback = await ethers.deployContract('BuybackBurn', [
      await token.getAddress(),
      await router.getAddress(),
      admin.address,
    ]);

    // Stock the pool so it has something to sell.
    await token.grantRole(await token.MINTER_ROLE(), admin.address);
    await token.mint(await router.getAddress(), ethers.parseEther('500000'));

    return { token, router, buyback, admin, other };
  }

  it('accepts revenue in ETH and says so', async () => {
    const { buyback, admin } = await deploy();
    const amount = ethers.parseEther('1');
    await expect(admin.sendTransaction({ to: await buyback.getAddress(), value: amount }))
      .to.emit(buyback, 'RevenueReceived')
      .withArgs(admin.address, amount);
    expect(await ethers.provider.getBalance(await buyback.getAddress())).to.equal(amount);
  });

  it('buys tokens with revenue and burns them, reducing total supply', async () => {
    const { token, buyback, admin } = await deploy();
    const spend = ethers.parseEther('0.001');
    await admin.sendTransaction({ to: await buyback.getAddress(), value: spend });

    const supplyBefore = await token.totalSupply();
    const expected = spend * RATE;
    const deadline = (await time.latest()) + 600;

    await expect(buyback.buybackAndBurn(spend, expected, deadline))
      .to.emit(buyback, 'TokensBurned')
      .withArgs(expected, spend, admin.address);

    expect(await token.totalSupply()).to.equal(supplyBefore - expected);
    // Nothing is left sitting in the contract afterwards.
    expect(await token.balanceOf(await buyback.getAddress())).to.equal(0);
  });

  it('spends the whole balance when given zero', async () => {
    const { token, buyback, admin } = await deploy();
    const balance = ethers.parseEther('0.002');
    await admin.sendTransaction({ to: await buyback.getAddress(), value: balance });

    const supplyBefore = await token.totalSupply();
    const deadline = (await time.latest()) + 600;
    await buyback.buybackAndBurn(0, 0, deadline);

    expect(await token.totalSupply()).to.equal(supplyBefore - balance * RATE);
    expect(await ethers.provider.getBalance(await buyback.getAddress())).to.equal(0);
  });

  it('honours the slippage floor', async () => {
    const { buyback, admin } = await deploy();
    const spend = ethers.parseEther('0.001');
    await admin.sendTransaction({ to: await buyback.getAddress(), value: spend });

    const deadline = (await time.latest()) + 600;
    // Demand more than the pool will give: the swap must fail rather than
    // silently accept a worse price.
    await expect(
      buyback.buybackAndBurn(spend, spend * RATE + 1n, deadline),
    ).to.be.revertedWith('MockSwapRouter: insufficient output');
  });

  it('is treasurer-only', async () => {
    const { buyback, admin, other } = await deploy();
    await admin.sendTransaction({ to: await buyback.getAddress(), value: ethers.parseEther('0.001') });
    const deadline = (await time.latest()) + 600;

    await expect(
      buyback.connect(other).buybackAndBurn(0, 0, deadline),
    ).to.be.revertedWithCustomError(buyback, 'AccessControlUnauthorizedAccount');
  });

  it('refuses to spend what it does not have', async () => {
    const { buyback } = await deploy();
    const deadline = (await time.latest()) + 600;
    await expect(buyback.buybackAndBurn(0, 0, deadline)).to.be.revertedWithCustomError(
      buyback,
      'NothingToSpend',
    );
    await expect(
      buyback.buybackAndBurn(ethers.parseEther('5'), 0, deadline),
    ).to.be.revertedWithCustomError(buyback, 'NothingToSpend');
  });

  describe('burning fees that are already GoalToken', () => {
    /**
     * The second revenue stream. GoalManager's failure fee is denominated in
     * GoalToken already, so there is nothing to buy — swapping it for itself
     * would be theatre. It is burned directly, and `ethSpent: 0` in the event
     * is what distinguishes real demand from mere supply reduction to anyone
     * reading the chain.
     */
    it('burns held tokens without a swap', async () => {
      const { token, buyback, admin } = await deploy();
      const fees = ethers.parseEther('250');
      await token.mint(await buyback.getAddress(), fees);

      const supplyBefore = await token.totalSupply();
      await expect(buyback.burnCollectedFees(fees))
        .to.emit(buyback, 'TokensBurned')
        .withArgs(fees, 0, admin.address);

      expect(await token.totalSupply()).to.equal(supplyBefore - fees);
    });

    it('burns everything held when given zero', async () => {
      const { token, buyback } = await deploy();
      await token.mint(await buyback.getAddress(), ethers.parseEther('40'));
      await buyback.burnCollectedFees(0);
      expect(await token.balanceOf(await buyback.getAddress())).to.equal(0);
    });

    it('refuses to burn more than it holds', async () => {
      const { token, buyback } = await deploy();
      await token.mint(await buyback.getAddress(), ethers.parseEther('10'));
      await expect(
        buyback.burnCollectedFees(ethers.parseEther('11')),
      ).to.be.revertedWithCustomError(buyback, 'NothingToBurn');
    });
  });
});
