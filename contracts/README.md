# Gains Log — contracts

Tokenised goal staking on Sepolia. Deliberately isolated from the PWA: its own
`package.json` and `node_modules`, so Hardhat's dependency tree never touches
the app's build.

## What's here

| Contract | Does |
|---|---|
| `GoalToken` | ERC-20, capped supply. Minting is a role, held only by `GoalManager`. |
| `GoalManager` | Stake against a goal; full stake back on success plus a reward, stake minus a capped fee on failure. |
| `LogAnchor` | Anchors one Merkle root per batch of logs. No log ever goes on-chain. |
| `BuybackBurn` | Spends platform revenue buying GOAL and burns it. |

## The two decisions worth knowing

**Failure does not burn.** A failed goal returns the stake minus a platform fee
capped at 20% in the contract itself — not by policy, by `MAX_FEE_BPS`, so an
admin cannot raise it to 100% and take everything. Burning user funds would make
the token's scarcity depend on people failing, which is a perverse thing to build
an economy on. Deflation comes from `BuybackBurn`, funded by revenue.

**Anchoring proves existence, not truth.** A root commits to logs *as they were*
at anchoring time. Someone can still log a workout they never did — but they
cannot quietly rewrite last month's logs to justify a goal they are about to
claim. That is the whole and only guarantee.

## Setup

```bash
cd contracts
npm install
cp .env.example .env     # fill in RPC URL and a throwaway deployer key
npm run build
npm test
```

## Deploying

```bash
npm run deploy:local      # in-process chain, deploys a mock DEX router
npm run deploy:sepolia    # needs SEPOLIA_RPC_URL + DEPLOYER_PRIVATE_KEY
```

Writes `deployments/<network>.json` and prints the `NEXT_PUBLIC_*` variables to
paste into the PWA's `.env`.

`DEX_ROUTER_ADDRESS` has no default on purpose. Sepolia's pools are mostly empty,
so a hardcoded router would look configured and swap nothing — supply it
deliberately, or leave `BuybackBurn` unused until there is a pool worth buying
from.

## Anchoring a batch of logs

```bash
# Compute the root without sending anything
LOGS_FILE=scripts/logs.example.json DRY_RUN=1 npx hardhat run scripts/anchor.ts

# Anchor it
npx hardhat run scripts/anchor.ts --network sepolia

# Produce the proof for one log, to answer a challenge
LOGS_FILE=my-week.json PROVE_LOG_ID=clog… DRY_RUN=1 npx hardhat run scripts/anchor.ts
```

## The leaf encoding

`lib/merkle.ts` is the canonical definition, and the PWA has a matching copy.
If the two drift, proofs fail with a silent `false` rather than an error — so
`KNOWN_VECTOR` pins a fixed input to a fixed root and both sides assert it. If
that test fails, the copies have diverged; fix the encoding, don't re-pin the
vector.
