import { ethers, network } from 'hardhat';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Deploys the four contracts and wires the roles between them.
 *
 * Writes deployments/<network>.json at the end, which is the file the PWA reads
 * its addresses from. Copying addresses by hand between a terminal and a .env is
 * how a frontend ends up silently pointed at a contract from two deploys ago.
 */

/** Everything configurable, with the defaults stated rather than hidden. */
const TOKEN_NAME = process.env.TOKEN_NAME ?? 'Goal Token';
const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL ?? 'GOAL';
const TOKEN_CAP = ethers.parseEther(process.env.TOKEN_CAP ?? '1000000');
const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS ?? 1_000); // 10%
const REWARD_RATE_BPS = Number(process.env.REWARD_RATE_BPS ?? 2_000); // 20% of stake
/** Starting float so accounts have something to stake. 0 mints nothing. */
const INITIAL_MINT = ethers.parseEther(process.env.INITIAL_MINT ?? '10000');

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = process.env.ADMIN_ADDRESS ?? deployer.address;
  const treasury = process.env.TREASURY_ADDRESS ?? admin;

  console.log(`network:  ${network.name}`);
  console.log(`deployer: ${deployer.address}`);
  console.log(`admin:    ${admin}`);
  console.log(`treasury: ${treasury}\n`);

  const token = await ethers.deployContract('GoalToken', [
    TOKEN_NAME,
    TOKEN_SYMBOL,
    TOKEN_CAP,
    admin,
  ]);
  await token.waitForDeployment();
  console.log(`GoalToken    ${await token.getAddress()}`);

  const manager = await ethers.deployContract('GoalManager', [
    await token.getAddress(),
    admin,
    treasury,
    PLATFORM_FEE_BPS,
    REWARD_RATE_BPS,
  ]);
  await manager.waitForDeployment();
  console.log(`GoalManager  ${await manager.getAddress()}`);

  const anchor = await ethers.deployContract('LogAnchor', [admin]);
  await anchor.waitForDeployment();
  console.log(`LogAnchor    ${await anchor.getAddress()}`);

  /**
   * The router is not defaulted to a hardcoded address.
   *
   * Sepolia's DEX deployments move and its pools are mostly empty, so baking in
   * an address would give a contract that looks configured and swaps nothing.
   * Locally a mock stands in; on a real network the address must be supplied
   * deliberately.
   */
  let routerAddress = process.env.DEX_ROUTER_ADDRESS;
  if (!routerAddress) {
    if (network.name !== 'hardhat' && network.name !== 'localhost') {
      throw new Error(
        'DEX_ROUTER_ADDRESS is not set. Supply the router for this network, or ' +
          'deploy without BuybackBurn until you have a pool worth buying from.',
      );
    }
    const mock = await ethers.deployContract('MockSwapRouter', [
      1000n,
      ethers.Wallet.createRandom().address,
    ]);
    await mock.waitForDeployment();
    routerAddress = await mock.getAddress();
    console.log(`MockSwapRouter ${routerAddress}  (local only)`);
  }

  const buyback = await ethers.deployContract('BuybackBurn', [
    await token.getAddress(),
    routerAddress,
    admin,
  ]);
  await buyback.waitForDeployment();
  console.log(`BuybackBurn  ${await buyback.getAddress()}\n`);

  // ── Roles ───────────────────────────────────────────────────────────────
  const MINTER_ROLE = await token.MINTER_ROLE();
  await (await token.grantRole(MINTER_ROLE, await manager.getAddress())).wait();
  console.log('granted MINTER_ROLE to GoalManager');

  if (INITIAL_MINT > 0n) {
    // Temporary: nobody can stake before any tokens exist. The right to mint is
    // handed back immediately, so the cap is the only thing standing between
    // the deployer and unlimited supply for as short a time as possible.
    await (await token.grantRole(MINTER_ROLE, deployer.address)).wait();
    await (await token.mint(deployer.address, INITIAL_MINT)).wait();
    await (await token.renounceRole(MINTER_ROLE, deployer.address)).wait();
    console.log(`minted ${ethers.formatEther(INITIAL_MINT)} ${TOKEN_SYMBOL} float, then renounced minting`);
  }

  const record = {
    network: network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    admin,
    treasury,
    contracts: {
      GoalToken: await token.getAddress(),
      GoalManager: await manager.getAddress(),
      LogAnchor: await anchor.getAddress(),
      BuybackBurn: await buyback.getAddress(),
      SwapRouter: routerAddress,
    },
    config: {
      cap: TOKEN_CAP.toString(),
      platformFeeBps: PLATFORM_FEE_BPS,
      rewardRateBps: REWARD_RATE_BPS,
    },
  };

  const dir = join(__dirname, '..', 'deployments');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${network.name}.json`), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`\nwrote deployments/${network.name}.json`);

  console.log('\nPut these in the PWA .env:');
  console.log(`  NEXT_PUBLIC_CHAIN_ID=${record.chainId}`);
  console.log(`  NEXT_PUBLIC_GOAL_TOKEN_ADDRESS=${record.contracts.GoalToken}`);
  console.log(`  NEXT_PUBLIC_GOAL_MANAGER_ADDRESS=${record.contracts.GoalManager}`);
  console.log(`  NEXT_PUBLIC_LOG_ANCHOR_ADDRESS=${record.contracts.LogAnchor}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
