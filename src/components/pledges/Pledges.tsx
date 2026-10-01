'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEther, parseEther, type Address } from 'viem';
import { goalManagerAbi, goalTokenAbi } from '@/lib/chain/abis';
import {
  chain,
  connect,
  ensureChain,
  explorerUrl,
  friendlyError,
  goalManager,
  goalToken,
  isMobileDevice,
  metamaskDappLink,
  waitForWallet,
  onRightChain,
  onWalletChange,
  publicClient,
  silentAccount,
  walletClient,
} from '@/lib/chain/browser';
import { outcomes } from '@/lib/chain/pledge-math';
import { SkeletonBlock } from '@/components/Skeleton';
import { PledgeCard, fmtGoal, titleOf, type Pledge, type Rates } from '@/components/pledges/PledgeCard';
import { PledgeComposer, type Baseline } from '@/components/pledges/PledgeComposer';
import { Rewards, type RewardsData } from '@/components/pledges/Rewards';
import { todayKey } from '@/lib/date';

const FAUCET_URL = 'https://www.bnbchain.org/en/testnet-faucet';
/** Enough native coin for a handful of transactions on BSC Testnet. */
const MIN_GAS = parseEther('0.001');

type Toast = { tone: 'ok' | 'err'; text: string } | null;

/**
 * The Pledges tab: put GOAL behind a training goal, let your logs decide.
 *
 * Built around three questions, in the order people ask them:
 *   1. What do I have?        — the balance strip at the top
 *   2. Am I going to make it? — each live pledge leads with pace, not raw totals
 *   3. How do I start one?    — a guided composer seeded from my own history
 *
 * Anything a newcomer needs before they can pledge (a wallet, the right
 * network, a little gas, some GOAL) is one checklist that shows only the next
 * missing step — rather than an error at the moment they try to commit.
 */
export function Pledges() {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [address, setAddress] = useState<Address | null>(null);
  const [linked, setLinked] = useState<string | null | undefined>(undefined);
  const [rightChain, setRightChain] = useState(true);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [gas, setGas] = useState<bigint | null>(null);
  const [pledges, setPledges] = useState<Pledge[] | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [starter, setStarter] = useState<{ available: boolean; amount: number } | null>(null);
  const [composing, setComposing] = useState(false);
  const [view, setView] = useState<'pledges' | 'earn'>('pledges');
  const [rewards, setRewards] = useState<RewardsData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const loadRewards = useCallback(async () => {
    const res = await fetch(`/api/rewards?today=${todayKey()}`);
    if (res.ok) setRewards((await res.json()) as RewardsData);
  }, []);

  const loadPledges = useCallback(async () => {
    const res = await fetch('/api/chain/goals');
    if (res.ok) setPledges((await res.json()) as Pledge[]);
    else setPledges([]);
  }, []);

  const refreshWallet = useCallback(async (who: Address | null) => {
    if (!who) {
      setBalance(null);
      setGas(null);
      return;
    }
    const [bal, native, ok] = await Promise.all([
      publicClient.readContract({
        address: goalToken,
        abi: goalTokenAbi,
        functionName: 'balanceOf',
        args: [who],
      }),
      publicClient.getBalance({ address: who }),
      onRightChain(),
    ]);
    setBalance(bal);
    setGas(native);
    setRightChain(ok);
  }, []);

  // Everything that doesn't need the wallet loads immediately and in parallel.
  useEffect(() => {
    void waitForWallet().then(setInstalled);
    void loadPledges();
    void loadRewards();
    fetch('/api/chain/link-wallet')
      .then((r) => r.json())
      .then((d: { address: string | null }) => setLinked(d.address))
      .catch(() => setLinked(null));
    fetch('/api/chain/baseline')
      .then((r) => (r.ok ? r.json() : null))
      .then(setBaseline)
      .catch(() => {});
    fetch('/api/chain/starter')
      .then((r) => (r.ok ? r.json() : null))
      .then(setStarter)
      .catch(() => {});
    Promise.all([
      publicClient.readContract({ address: goalManager, abi: goalManagerAbi, functionName: 'rewardRateBps' }),
      publicClient.readContract({ address: goalManager, abi: goalManagerAbi, functionName: 'platformFeeBps' }),
    ])
      .then(([rewardBps, feeBps]) => setRates({ rewardBps, feeBps }))
      .catch(() => {});
  }, [loadPledges, loadRewards]);

  // Restore an already-authorised wallet without a popup, and follow the
  // wallet if the user switches account or network in it.
  useEffect(() => {
    if (!installed) return;
    const sync = async () => {
      const who = await silentAccount();
      setAddress(who);
      await refreshWallet(who).catch(() => {});
    };
    void sync();
    return onWalletChange(() => void sync());
  }, [installed, refreshWallet]);

  // Inside a wallet's own browser the user has already chosen to be here, so
  // don't make them find a Connect button: ask once, and once connected put
  // the wallet on the app's network (adding it if the wallet has never heard
  // of it) without a separate tap.
  const [autoTried, setAutoTried] = useState(false);
  useEffect(() => {
    if (!installed || autoTried || busy) return;
    if (!address) {
      if (isMobileDevice()) {
        setAutoTried(true);
        void onConnect();
      }
      return;
    }
    if (!rightChain) {
      setAutoTried(true);
      void onSwitch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [installed, address, rightChain, autoTried, busy]);

  // A wallet already authorised in this browser, on an account with nothing
  // linked yet (a second device, a fresh account): link it without asking.
  // Without this the page showed "connected" while every server-side step —
  // starter tokens, claiming — failed with "connect a wallet first".
  useEffect(() => {
    if (!address || linked !== null) return;
    link(address).catch((e) => setToast({ tone: 'err', text: friendlyError(e) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, linked]);

  async function link(who: Address) {
    const res = await fetch('/api/chain/link-wallet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: who }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? 'Could not link that wallet.');
    setLinked(json.address);
  }

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setToast(null);
    try {
      await fn();
    } catch (e) {
      setToast({ tone: 'err', text: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  }

  const onConnect = () =>
    run('connect', async () => {
      const who = await connect();
      await ensureChain();
      setAddress(who);
      await link(who);
      await refreshWallet(who);
    });

  const onSwitch = () =>
    run('switch', async () => {
      await ensureChain();
      await refreshWallet(address);
    });

  const onStarter = () =>
    run('starter', async () => {
      const res = await fetch('/api/chain/starter', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not send starter tokens.');
      setStarter((s) => (s ? { ...s, available: false } : s));
      await refreshWallet(address);
      setToast({ tone: 'ok', text: `${json.amount} GOAL is in your wallet. Make your first pledge.` });
    });

  const onWatchToken = () =>
    run('watch', async () => {
      await walletClient().watchAsset({
        type: 'ERC20',
        options: { address: goalToken, symbol: 'GOAL', decimals: 18 },
      });
    });

  const onClaim = (p: Pledge) =>
    run(`pledge-${p.goalId}`, async () => {
      const res = await fetch('/api/chain/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: p.goalId }),
      });
      const json = await res.json();
      if (json.settled) {
        setToast({ tone: 'ok', text: 'Verified from your logs — stake returned and reward paid. 🎉' });
      } else {
        setToast({ tone: 'err', text: json.error ?? `Not yet: ${json.verdict?.detail ?? 'target not reached.'}` });
      }
      await Promise.all([loadPledges(), loadRewards(), refreshWallet(address)]);
    });

  // Anyone may close a pledge once its deadline passes; doing it from your own
  // wallet returns the stake minus the fee without waiting on anybody.
  const onSettle = (p: Pledge) =>
    run(`pledge-${p.goalId}`, async () => {
      if (!address) throw new Error('Connect your wallet first.');
      await ensureChain();
      const hash = await walletClient().writeContract({
        address: goalManager,
        abi: goalManagerAbi,
        functionName: 'markFailed',
        args: [BigInt(p.goalId)],
        account: address,
        chain,
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setToast({ tone: 'ok', text: 'Pledge closed and the rest of your stake returned. Next one.' });
      await Promise.all([loadPledges(), loadRewards(), refreshWallet(address)]);
    });

  // ── Derived ─────────────────────────────────────────────────────────────
  const active = (pledges ?? []).filter((p) => p.status === 'Active' || p.status === null);
  const past = (pledges ?? []).filter((p) => p.status === 'Succeeded' || p.status === 'Failed');
  const locked = active.reduce((sum, p) => sum + (p.stakeAmount ? BigInt(p.stakeAmount) : 0n), 0n);
  const earned = rates
    ? past
        .filter((p) => p.status === 'Succeeded' && p.stakeAmount)
        .reduce((sum, p) => sum + outcomes(BigInt(p.stakeAmount!), rates.rewardBps, rates.feeBps).reward, 0n)
    : 0n;
  const won = past.filter((p) => p.status === 'Succeeded').length;

  const steps = [
    { key: 'install', done: installed === true },
    { key: 'connect', done: !!address && !!linked && linked.toLowerCase() === address.toLowerCase() },
    { key: 'network', done: !!address && rightChain },
    { key: 'gas', done: gas !== null && gas >= MIN_GAS },
    { key: 'tokens', done: balance !== null && (balance > 0n || locked > 0n) },
  ];
  const next = steps.find((s) => !s.done)?.key ?? null;
  const ready = next === null;

  if (installed === null || pledges === null) {
    return (
      <div className="space-y-4">
        <SkeletonBlock className="h-28" />
        <SkeletonBlock className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {toast && (
        <p
          role="status"
          className={`rounded-2xl border p-3 text-sm ${
            toast.tone === 'ok'
              ? 'border-accent/40 bg-accent/5 text-ink'
              : 'border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-300'
          }`}
        >
          {toast.text}
        </p>
      )}

      {/* ── What do I have ─────────────────────────────────────────────── */}
      <section className="card" aria-label="Your GOAL">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Available</p>
            <p className="mt-0.5 text-4xl font-bold tabular-nums leading-none">
              {balance !== null ? fmtGoal(balance) : '—'}
              <span className="ml-1.5 text-base font-semibold text-muted">GOAL</span>
            </p>
          </div>
          {address && (
            <a
              href={explorerUrl('address', address) ?? '#'}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-full border border-line px-2.5 py-1 font-mono text-[11px] text-muted"
              title={address}
            >
              {address.slice(0, 6)}…{address.slice(-4)} ↗
            </a>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 text-center">
          <Stat label="Locked in pledges" value={fmtGoal(locked)} />
          <Stat label="Earned" value={`+${fmtGoal(earned)}`} accent />
          <Stat label="Pledges won" value={`${won}/${past.length}`} />
        </dl>

        {address && (
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
            <span>
              {chain.name}
              {gas !== null && ` · ${Number(formatEther(gas)).toFixed(4)} ${chain.nativeCurrency.symbol} for fees`}
            </span>
            <button type="button" className="underline underline-offset-2" onClick={() => void onWatchToken()}>
              Show GOAL in wallet
            </button>
          </div>
        )}
      </section>

      {/* Pledges risk GOAL; quests pay it out. Same tab, two jobs. */}
      <div role="tablist" aria-label="Pledges or rewards" className="grid grid-cols-2 gap-1 rounded-xl bg-line/60 p-1">
        {(['pledges', 'earn'] as const).map((v) => {
          const on = view === v;
          const waiting = v === 'earn' ? (rewards?.quests.filter((q) => q.claimable.length > 0).length ?? 0) : 0;
          return (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setView(v)}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${
                on ? 'bg-card text-ink shadow-sm' : 'text-muted'
              }`}
            >
              <span aria-hidden>{v === 'pledges' ? '🎯' : '🏆'}</span>
              {v === 'pledges' ? 'Pledges' : 'Earn GOAL'}
              {waiting > 0 && (
                <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold leading-5 text-white">
                  {waiting}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {view === 'earn' && (
        <Rewards
          data={rewards}
          onChanged={async (message) => {
            if (message) setToast({ tone: 'ok', text: message });
            await Promise.all([loadRewards(), refreshWallet(address)]);
          }}
        />
      )}

      {view === 'pledges' && (
        <>
        {/* ── Getting set up (only the next missing step) ───────────────── */}
        {!ready && (
          <SetupStep
            next={next!}
            busy={busy}
            starter={starter}
            gasSymbol={chain.nativeCurrency.symbol}
            networkName={chain.name}
            walletPresent={!!address}
            mobile={isMobileDevice()}
            progress={steps.findIndex((s) => !s.done)}
            total={steps.length}
            onConnect={() => void onConnect()}
            onSwitch={() => void onSwitch()}
            onStarter={() => void onStarter()}
            onRecheck={() => void refreshWallet(address)}
          />
        )}

        {/* ── Am I going to make it ─────────────────────────────────────── */}
        <section aria-label="Active pledges">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">
              Active{active.length > 0 && <span className="ml-1.5 text-muted">{active.length}</span>}
            </h2>
          </div>

          {active.length === 0 && !composing && (
            <div className="card text-center">
              <p className="text-3xl" aria-hidden>
                🎯
              </p>
              <p className="mt-1 text-sm font-semibold">No live pledges</p>
              <p className="mx-auto mt-1 max-w-xs text-xs text-muted">
                Put a few GOAL behind a goal you&apos;d otherwise let slide. Hit it and earn{' '}
                {rates ? `${rates.rewardBps / 100}%` : 'a reward'}; miss it and you still get most of it back.
              </p>
            </div>
          )}

          {active.length > 0 && (
            <ul className="space-y-3">
              {active.map((p) => (
                <PledgeCard
                  key={p.id}
                  pledge={p}
                  rates={rates}
                  busy={busy === `pledge-${p.goalId}`}
                  onClaim={() => void onClaim(p)}
                  onSettle={() => void onSettle(p)}
                />
              ))}
            </ul>
          )}
        </section>

        {/* ── How do I start one ────────────────────────────────────────── */}
        {composing && address && balance !== null ? (
          <PledgeComposer
            address={address}
            balance={balance}
            baseline={baseline}
            rates={rates}
            onCancel={() => setComposing(false)}
            onDone={async (message) => {
              setComposing(false);
              setToast({ tone: 'ok', text: message });
              await Promise.all([loadPledges(), loadRewards(), refreshWallet(address)]);
            }}
          />
        ) : (
          <button
            type="button"
            className="btn-primary w-full"
            disabled={!ready}
            onClick={() => {
              setToast(null);
              setComposing(true);
            }}
          >
            {ready ? '+ New pledge' : 'Finish setup to make a pledge'}
          </button>
        )}

        {/* ── History ───────────────────────────────────────────────────── */}
        {past.length > 0 && (
          <details className="card group">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
              Past pledges
              <span className="text-xs font-normal text-muted group-open:hidden">
                {won} won · {past.length - won} missed ▾
              </span>
            </summary>
            <ul className="mt-3 divide-y divide-line">
              {past.map((p) => {
                const tx = p.txHash ? explorerUrl('tx', p.txHash) : null;
                const ok = p.status === 'Succeeded';
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span
                      aria-hidden
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        ok ? 'bg-accent/15 text-accent' : 'bg-line text-muted'
                      }`}
                    >
                      {ok ? '✓' : '–'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{titleOf(p)}</p>
                      <p className="text-xs text-muted">
                        {p.progress.actual.toLocaleString()} / {p.target.toLocaleString()} ·{' '}
                        {new Date(p.deadline).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold ${ok ? 'text-accent' : 'text-muted'}`}>
                      {ok ? 'Won' : 'Missed'}
                    </span>
                    {tx && (
                      <a href={tx} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-muted" aria-label="View on block explorer">
                        ↗
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        <HowItWorks rates={rates} />
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className={`text-base font-semibold tabular-nums ${accent ? 'text-accent' : ''}`}>{value}</dd>
    </div>
  );
}

const STEP_COPY: Record<string, { title: string; body: string }> = {
  install: {
    title: 'Install a wallet',
    body: 'Pledges live on a blockchain, so you need a wallet app to hold GOAL. MetaMask is the most common — open this page in its built-in browser on mobile.',
  },
  connect: {
    title: 'Connect your wallet',
    body: 'Links your wallet to this account so your logs can be matched to your pledges. Your Google sign-in stays the same.',
  },
  network: {
    title: 'Switch network',
    body: 'Your wallet is on a different network. We’ll add it for you if it’s missing.',
  },
  gas: {
    title: 'Get a little test gas',
    body: 'Every blockchain action costs a tiny network fee. The official faucet gives it free — paste your wallet address there, then come back.',
  },
  tokens: {
    title: 'Get your starter GOAL',
    body: 'GOAL is what you put on the line. Claim a one-time starter amount to make your first pledge.',
  },
};

function SetupStep({
  next,
  busy,
  starter,
  gasSymbol,
  networkName,
  walletPresent,
  mobile,
  progress,
  total,
  onConnect,
  onSwitch,
  onStarter,
  onRecheck,
}: {
  next: string;
  busy: string | null;
  starter: { available: boolean; amount: number } | null;
  gasSymbol: string;
  networkName: string;
  walletPresent: boolean;
  mobile: boolean;
  progress: number;
  total: number;
  onConnect: () => void;
  onSwitch: () => void;
  onStarter: () => void;
  onRecheck: () => void;
}) {
  const copy = STEP_COPY[next];
  return (
    <section className="card border-accent/40" aria-label="Set up pledges">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          Setup · step {progress + 1} of {total}
        </p>
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-1.5 w-5 rounded-full ${i < progress ? 'bg-accent' : 'bg-line'}`} />
          ))}
        </div>
      </div>
      <p className="mt-2 text-base font-semibold">
        {next === 'network'
          ? `Switch to ${networkName}`
          : next === 'gas'
            ? `Get a little test ${gasSymbol}`
            : next === 'connect' && walletPresent
              ? 'Use this wallet for pledges'
              : copy.title}
      </p>
      <p className="mt-1 text-sm text-muted">
        {next === 'install' && mobile
          ? 'Phone browsers can’t see your wallet app. Open this page inside MetaMask’s own browser and it connects and sets up the network for you.'
          : next === 'connect' && walletPresent
          ? 'The wallet open in this browser isn’t the one linked to your account. Pledges, claims and starter tokens follow the linked wallet.'
          : copy.body}
      </p>

      <div className="mt-3">
        {next === 'install' &&
          (mobile ? (
            <div className="space-y-2">
              <a className="btn-primary w-full" href={metamaskDappLink()}>
                Open in MetaMask
              </a>
              <p className="text-center text-xs text-muted">
                Don&apos;t have it?{' '}
                <a className="underline underline-offset-2" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                  Install MetaMask
                </a>
              </p>
            </div>
          ) : (
            <a className="btn-primary w-full" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
              Get MetaMask ↗
            </a>
          ))}
        {next === 'connect' && (
          <button type="button" className="btn-primary w-full" disabled={busy === 'connect'} onClick={onConnect}>
            {busy === 'connect'
              ? 'Waiting for your wallet…'
              : walletPresent
                ? 'Use this wallet'
                : 'Connect wallet'}
          </button>
        )}
        {next === 'network' && (
          <button type="button" className="btn-primary w-full" disabled={busy === 'switch'} onClick={onSwitch}>
            {busy === 'switch' ? 'Check your wallet…' : `Switch to ${networkName}`}
          </button>
        )}
        {next === 'gas' && (
          <div className="flex gap-2">
            <a className="btn-primary flex-1" href={FAUCET_URL} target="_blank" rel="noreferrer">
              Open faucet ↗
            </a>
            <button type="button" className="btn-quiet shrink-0 px-4" onClick={onRecheck}>
              I&apos;ve got it
            </button>
          </div>
        )}
        {next === 'tokens' &&
          (starter?.available ? (
            <button type="button" className="btn-primary w-full" disabled={busy === 'starter'} onClick={onStarter}>
              {busy === 'starter' ? 'Sending…' : `Claim ${starter.amount} starter GOAL`}
            </button>
          ) : (
            <p className="text-sm text-muted">
              You&apos;ve already claimed your starter GOAL. Ask the admin to send more to your wallet address.
            </p>
          ))}
      </div>
    </section>
  );
}

function HowItWorks({ rates }: { rates: Rates | null }) {
  const reward = rates ? `${rates.rewardBps / 100}%` : 'a reward';
  const fee = rates ? `${rates.feeBps / 100}%` : 'a small fee';
  return (
    <details className="card">
      <summary className="cursor-pointer list-none text-sm font-semibold">How pledges work ▾</summary>
      <ol className="mt-3 space-y-3 text-sm">
        <li>
          <strong>1. Commit.</strong>{' '}
          <span className="text-muted">
            Pick a goal, a deadline and how much GOAL to put behind it. It&apos;s locked in a smart contract —
            not held by us.
          </span>
        </li>
        <li>
          <strong>2. Train and log as usual.</strong>{' '}
          <span className="text-muted">Nothing new to do. Progress updates from the sets and meals you already log.</span>
        </li>
        <li>
          <strong>3. Claim.</strong>{' '}
          <span className="text-muted">
            Hit the target and the app checks your logs, then returns your stake plus {reward}.
          </span>
        </li>
        <li>
          <strong>4. Or close it out.</strong>{' '}
          <span className="text-muted">
            Miss it and you get your stake back minus {fee}. Nothing is burned — you lose the fee, not the pledge.
          </span>
        </li>
      </ol>
      <p className="mt-3 border-t border-line pt-2 text-[11px] text-muted">
        Your workouts and meals never go on the blockchain — only the goal, the deadline and the result.
        The fee can never exceed 20%; that limit is written into the contract itself. Running on {chain.name}: GOAL
        here is test currency with no cash value.
      </p>
    </details>
  );
}
