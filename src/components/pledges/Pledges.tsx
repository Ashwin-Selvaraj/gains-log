'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatEther, parseEther, type Address } from 'viem';
import { goalManagerAbi, goalTokenAbi } from '@/lib/chain/abis';
import {
  chain,
  connect,
  ensureChain,
  explorerUrl,
  friendlyError,
  isRejection,
  goalManager,
  goalToken,
  addNetworkToWallet,
  addTokenToWallet,
  disconnect,
  onWalletChange,
  onWalletLink,
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
 * The Pledges tab: put GAINS behind a training goal, let your logs decide.
 *
 * Built around three questions, in the order people ask them:
 *   1. What do I have?        — the balance strip at the top
 *   2. Am I going to make it? — each live pledge leads with pace, not raw totals
 *   3. How do I start one?    — a guided composer seeded from my own history
 *
 * Anything a newcomer needs before they can pledge (a wallet, the right
 * network, a little gas, some GAINS) is one checklist that shows only the next
 * missing step — rather than an error at the moment they try to commit.
 */
export function Pledges() {
  const [address, setAddress] = useState<Address | null>(null);
  const [linked, setLinked] = useState<string | null | undefined>(undefined);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [gas, setGas] = useState<bigint | null>(null);
  const [pledges, setPledges] = useState<Pledge[] | null>(null);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [starter, setStarter] = useState<{ available: boolean; amount: number } | null>(null);
  const [composing, setComposing] = useState(false);
  // What MetaMask has been told, per wallet. The app can't ask MetaMask which
  // networks or tokens it lists, so these record that the user confirmed it.
  // The token flag is keyed by the token address too, so a redeployed token
  // shows up as a step to redo rather than silently "done".
  const [walletSetup, setWalletSetup] = useState({ network: false, token: false });
  // Set when the connector tries to open MetaMask; shown as a manual link in
  // case the phone didn't switch apps on its own.
  const [walletLink, setWalletLink] = useState<string | null>(null);
  // Set when MetaMask fails the automatic "add token" request; the step then
  // switches to the manual import, which always works.
  const [manualToken, setManualToken] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const off = onWalletLink((url) => {
      setWalletLink(url);
      clearTimeout(timer);
      timer = setTimeout(() => setWalletLink(null), 90_000);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, []);
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
    const [bal, native] = await Promise.all([
      publicClient.readContract({
        address: goalToken,
        abi: goalTokenAbi,
        functionName: 'balanceOf',
        args: [who],
      }),
      publicClient.getBalance({ address: who }),
    ]);
    setBalance(bal);
    setGas(native);
  }, []);

  // Everything that doesn't need the wallet loads immediately and in parallel.
  useEffect(() => {
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

  // Restore a previous session without a popup, and follow the wallet when
  // the account or network changes in it — including when someone comes back
  // from approving in the MetaMask app.
  useEffect(() => {
    const sync = async () => {
      const who = await silentAccount();
      setAddress(who);
      await refreshWallet(who).catch(() => {});
    };
    void sync();
    return onWalletChange(() => void sync());
  }, [refreshWallet]);

  // A wallet already authorised in this browser, on an account with nothing
  // linked yet (a second device, a fresh account): link it without asking.
  // Without this the page showed "connected" while every server-side step —
  // starter tokens, claiming — failed with "connect a wallet first".
  useEffect(() => {
    if (!address || linked !== null) return;
    link(address).catch((e) => setToast({ tone: 'err', text: friendlyError(e) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, linked]);

  useEffect(() => {
    if (!address) return;
    try {
      setWalletSetup({
        network: localStorage.getItem(flagKey('network', address)) === '1',
        token: localStorage.getItem(flagKey('token', address)) === '1',
      });
    } catch {
      setWalletSetup({ network: false, token: false });
    }
  }, [address]);

  function markSetup(which: 'network' | 'token') {
    try {
      if (address) localStorage.setItem(flagKey(which, address), '1');
    } catch {}
    setWalletSetup((w) => ({ ...w, [which]: true }));
  }

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
      setWalletLink(null);
    }
  }

  const onConnect = () =>
    run('connect', async () => {
      // Opens MetaMask (the app on a phone, the extension on desktop) for one
      // approval that also puts the wallet on the app's network.
      const who = await connect();
      setAddress(who);
      await link(who);
      await refreshWallet(who);
    });

  const onAddNetwork = () =>
    run('network', async () => {
      await addNetworkToWallet();
      markSetup('network');
      setToast({ tone: 'ok', text: `MetaMask is on ${chain.name} now.` });
    });

  const onStarter = () =>
    run('starter', async () => {
      const res = await fetch('/api/chain/starter', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not send starter tokens.');
      setStarter((s) => (s ? { ...s, available: false } : s));
      await refreshWallet(address);
      setToast({ tone: 'ok', text: `${json.amount} GAINS landed in your wallet on ${chain.name}. 🎉` });
    });

  // Tokens are in the wallet either way; this just makes MetaMask list them,
  // since it doesn't show tokens it hasn't been told about.
  // MetaMask's phone app can fail wallet_watchAsset when it arrives over
  // MetaMask Connect (it shows a bare "Something went wrong"), and nothing on
  // this side can fix that. The tokens are in the wallet regardless — listing
  // them only needs the contract address — so a failure falls back to a manual
  // import instead of a dead end.
  const onWatchToken = () =>
    run('token', async () => {
      try {
        await addTokenToWallet();
        markSetup('token');
        setManualToken(false);
        setToast({ tone: 'ok', text: 'GAINS is listed in MetaMask — open the wallet to see your balance.' });
      } catch (e) {
        if (isRejection(e)) throw e;
        setManualToken(true);
        setToast({
          tone: 'err',
          text: 'MetaMask couldn’t add GAINS automatically. Your tokens are safe — add it manually below, it takes 30 seconds.',
        });
      }
    });

  const onDisconnect = () =>
    run('disconnect', async () => {
      await disconnect();
      setAddress(null);
      setBalance(null);
      setGas(null);
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
      const hash = await (await walletClient()).writeContract({
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

  // Receiving GAINS needs no gas and no signature — the server sends it — so
  // tokens come before gas. Gas only matters once you want to pledge.
  const connected = !!address && !!linked && linked.toLowerCase() === address.toLowerCase();
  const steps: SetupStepState[] = [
    { key: 'connect', done: connected, detail: address ? `${address.slice(0, 6)}…${address.slice(-4)}` : undefined },
    { key: 'network', done: connected && walletSetup.network },
    {
      key: 'tokens',
      done: balance !== null && (balance > 0n || locked > 0n || starter?.available === false),
      detail: balance !== null && balance > 0n ? `${fmtGoal(balance)} GAINS in your wallet` : undefined,
    },
    { key: 'token', done: connected && walletSetup.token },
    {
      key: 'gas',
      done: gas !== null && gas >= MIN_GAS,
      detail: gas !== null && gas > 0n ? `${Number(formatEther(gas)).toFixed(4)} ${chain.nativeCurrency.symbol}` : undefined,
    },
  ];
  const nextIndex = steps.findIndex((s) => !s.done);
  // Pledging needs a connection, some GAINS and gas. Whether MetaMask *shows*
  // the network or token is for the person's benefit, not the transaction's.
  const ready = ['connect', 'tokens', 'gas'].every((k) => steps.find((s) => s.key === k)?.done);

  if (pledges === null) {
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

      {walletLink && (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/5 p-3 text-sm">
          <span aria-hidden className="text-xl">🦊</span>
          <p className="min-w-0 flex-1">
            Approve in MetaMask, then come back here.
            <span className="block text-xs text-muted">Didn&apos;t switch to MetaMask?</span>
          </p>
          <a href={walletLink} className="btn-primary shrink-0 px-3 text-sm">
            Open MetaMask
          </a>
        </div>
      )}

      {/* ── What do I have ─────────────────────────────────────────────── */}
      <section className="card" aria-label="Your GAINS">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Available</p>
            {balance !== null ? (
              <p className="mt-0.5 text-4xl font-bold tabular-nums leading-none">
                {fmtGoal(balance)}
                <span className="ml-1.5 text-base font-semibold text-muted">GAINS</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted">Connect MetaMask below to see your GAINS.</p>
            )}
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
          <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted">
            <span className="min-w-0 truncate">
              {chain.name}
              {gas !== null && ` · ${Number(formatEther(gas)).toFixed(4)} ${chain.nativeCurrency.symbol} for fees`}
            </span>
            <button
              type="button"
              className="shrink-0 underline underline-offset-2"
              disabled={busy === 'disconnect'}
              onClick={() => void onDisconnect()}
            >
              Disconnect
            </button>
          </div>
        )}
      </section>

      {/* Pledges risk GAINS; quests pay it out. Same tab, two jobs. */}
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
              {v === 'pledges' ? 'Pledges' : 'Earn GAINS'}
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
        {/* ── Wallet setup: every step, swipeable ─────────────────────── */}
        <SetupCarousel
          steps={steps}
          current={nextIndex}
          busy={busy}
          starter={starter}
          walletPresent={!!address}
          onConnect={() => void onConnect()}
          onAddNetwork={() => void onAddNetwork()}
          onStarter={() => void onStarter()}
          onAddToken={() => void onWatchToken()}
          manualToken={manualToken}
          onShowManualToken={() => setManualToken(true)}
          onManualTokenDone={() => {
            markSetup('token');
            setManualToken(false);
            setToast({ tone: 'ok', text: 'Nice — GAINS should now show in MetaMask under BNB Smart Chain Testnet.' });
          }}
          onRecheck={() => void refreshWallet(address)}
        />

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
                Put a few GAINS behind a goal you&apos;d otherwise let slide. Hit it and earn{' '}
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

type SetupStepState = { key: string; done: boolean; detail?: string };

function flagKey(which: 'network' | 'token', address: string): string {
  return which === 'token'
    ? `gains-wallet-token:${goalToken.toLowerCase()}:${address.toLowerCase()}`
    : `gains-wallet-network:${chain.id}:${address.toLowerCase()}`;
}

const STEP_COPY: Record<string, { icon: string; title: string; body: string; doneTitle: string }> = {
  connect: {
    icon: '🦊',
    title: 'Connect MetaMask',
    body: 'MetaMask opens to approve, then you come back here. No password, no transaction, nothing to pay.',
    doneTitle: 'Wallet connected',
  },
  network: {
    icon: '🔗',
    title: `Add ${chain.name} to MetaMask`,
    body: 'GAINS lives on this network. MetaMask asks to add it (if it’s new) and switches to it, so your tokens show up there.',
    doneTitle: `MetaMask is on ${chain.name}`,
  },
  tokens: {
    icon: '🎁',
    title: 'Claim your free GAINS',
    body: 'A one-time starter amount, sent straight to your wallet. Nothing to sign or pay — you just receive it.',
    doneTitle: 'Starter GAINS received',
  },
  token: {
    icon: '👀',
    title: 'Show GAINS in MetaMask',
    body: 'MetaMask only lists tokens it’s been told about. One tap adds GAINS, with its logo, so you can see your balance there.',
    doneTitle: 'GAINS listed in MetaMask',
  },
  gas: {
    icon: '⛽',
    title: `Get a little test ${chain.nativeCurrency.symbol} to pledge`,
    body: 'Receiving GAINS is free. Making a pledge is a transaction with a tiny network fee — the official faucet gives test gas free. Paste your wallet address there, then come back.',
    doneTitle: 'Ready to pledge',
  },
};

/**
 * Wallet setup as a swipeable row of every step.
 *
 * Showing only the next step hid what had already been done — at step 4 there
 * was no way to see that steps 1–3 were finished, or to redo one (say, adding
 * the network on a second phone). Every step is a card you can swipe to; the
 * row opens on the current one. Once everything is done it folds away into one
 * line that can be reopened.
 */
function SetupCarousel({
  steps,
  current,
  busy,
  starter,
  walletPresent,
  onConnect,
  onAddNetwork,
  onStarter,
  onAddToken,
  onRecheck,
  manualToken,
  onShowManualToken,
  onManualTokenDone,
}: {
  steps: SetupStepState[];
  current: number;
  busy: string | null;
  starter: { available: boolean; amount: number } | null;
  walletPresent: boolean;
  onConnect: () => void;
  onAddNetwork: () => void;
  onStarter: () => void;
  onAddToken: () => void;
  onRecheck: () => void;
  manualToken: boolean;
  onShowManualToken: () => void;
  onManualTokenDone: () => void;
}) {
  const allDone = current === -1;
  const [open, setOpen] = useState(!allDone);
  const [shown, setShown] = useState(Math.max(0, current));
  const track = useRef<HTMLDivElement>(null);
  const doneCount = steps.filter((s) => s.done).length;

  // Land on the current step whenever it changes (a step just got finished).
  useEffect(() => {
    if (current < 0) return;
    setOpen(true);
    const el = track.current?.children[current] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }, [current]);

  function goTo(i: number) {
    const el = track.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }

  function onScroll() {
    const el = track.current;
    if (!el) return;
    setShown(Math.round(el.scrollLeft / el.clientWidth));
  }

  if (allDone && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card flex w-full items-center gap-3 text-left text-sm"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/15 text-accent">✓</span>
        <span className="min-w-0 flex-1 font-medium">Wallet set up</span>
        <span className="text-xs text-muted">View steps ▾</span>
      </button>
    );
  }

  return (
    <section className="card overflow-hidden p-0" aria-label="Wallet setup" aria-roledescription="carousel">
      <div className="flex items-center justify-between px-4 pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">
          Wallet setup · {doneCount} of {steps.length} done
        </p>
        {allDone && (
          <button type="button" className="text-xs text-muted" onClick={() => setOpen(false)}>
            Hide ▴
          </button>
        )}
      </div>

      <div
        ref={track}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {steps.map((step, i) => {
          const copy = STEP_COPY[step.key];
          const isCurrent = i === current;
          const locked = !step.done && current !== -1 && i > current;
          return (
            <div
              key={step.key}
              role="group"
              aria-label={`Step ${i + 1} of ${steps.length}`}
              className="w-full shrink-0 snap-start px-4 pb-3 pt-3"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl ${
                    step.done ? 'bg-accent/15' : isCurrent ? 'bg-accent/10 ring-2 ring-accent/40' : 'bg-surface'
                  }`}
                >
                  {step.done ? '✅' : copy.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    Step {i + 1}
                    {step.done ? ' · done' : isCurrent ? ' · now' : ''}
                  </p>
                  <p className="text-base font-semibold leading-snug">
                    {step.done ? copy.doneTitle : step.key === 'connect' && walletPresent ? 'Use this wallet' : copy.title}
                  </p>
                  {step.done && step.detail && <p className="text-xs text-muted">{step.detail}</p>}
                </div>
              </div>

              {!step.done && <p className="mt-2 text-sm text-muted">{copy.body}</p>}

              <div className="mt-3">
                {locked ? (
                  <p className="rounded-xl bg-surface px-3 py-2.5 text-center text-sm text-muted">
                    Finish step {current + 1} first
                  </p>
                ) : (
                  <StepAction
                    stepKey={step.key}
                    done={step.done}
                    busy={busy}
                    starter={starter}
                    walletPresent={walletPresent}
                    onConnect={onConnect}
                    onAddNetwork={onAddNetwork}
                    onStarter={onStarter}
                    onAddToken={onAddToken}
                    manualToken={manualToken}
                    onShowManualToken={onShowManualToken}
                    onManualTokenDone={onManualTokenDone}
                    onRecheck={onRecheck}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dots double as a step picker for anyone who doesn't think to swipe. */}
      <div className="flex justify-center gap-1.5 pb-3">
        {steps.map((step, i) => (
          <button
            key={step.key}
            type="button"
            aria-label={`Go to step ${i + 1}`}
            aria-current={shown === i ? 'step' : undefined}
            onClick={() => goTo(i)}
            className={`h-2 rounded-full transition-all ${shown === i ? 'w-6' : 'w-2'} ${
              step.done ? 'bg-accent' : i === current ? 'bg-accent/50' : 'bg-line'
            }`}
          />
        ))}
      </div>
    </section>
  );
}

function StepAction({
  stepKey,
  done,
  busy,
  starter,
  walletPresent,
  onConnect,
  onAddNetwork,
  onStarter,
  onAddToken,
  onRecheck,
  manualToken,
  onShowManualToken,
  onManualTokenDone,
}: {
  stepKey: string;
  done: boolean;
  busy: string | null;
  starter: { available: boolean; amount: number } | null;
  walletPresent: boolean;
  onConnect: () => void;
  onAddNetwork: () => void;
  onStarter: () => void;
  onAddToken: () => void;
  onRecheck: () => void;
  manualToken: boolean;
  onShowManualToken: () => void;
  onManualTokenDone: () => void;
}) {
  // Done steps that are safe to repeat keep a quiet button — adding the
  // network or token again is how a second phone gets set up.
  const quiet = 'btn-quiet w-full text-sm';
  switch (stepKey) {
    case 'connect':
      return done ? null : (
        <button type="button" className="btn-primary w-full" disabled={busy === 'connect'} onClick={onConnect}>
          {busy === 'connect' ? 'Waiting for MetaMask…' : walletPresent ? 'Use this wallet' : '🦊 Connect MetaMask'}
        </button>
      );
    case 'network':
      return (
        <button type="button" className={done ? quiet : 'btn-primary w-full'} disabled={busy === 'network'} onClick={onAddNetwork}>
          {busy === 'network' ? 'Approve in MetaMask…' : done ? 'Add / switch again' : `Add ${chain.name}`}
        </button>
      );
    case 'tokens':
      if (done) return null;
      return starter?.available ? (
        <button type="button" className="btn-primary w-full" disabled={busy === 'starter'} onClick={onStarter}>
          {busy === 'starter' ? 'Sending to your wallet…' : `Claim ${starter.amount} free GAINS`}
        </button>
      ) : (
        <p className="text-sm text-muted">Starter already claimed — earn more on the Earn GAINS side.</p>
      );
    case 'token':
      if (manualToken) return <ManualTokenImport onDone={onManualTokenDone} />;
      return (
        <div className="space-y-2">
          <button type="button" className={done ? quiet : 'btn-primary w-full'} disabled={busy === 'token'} onClick={onAddToken}>
            {busy === 'token' ? 'Approve in MetaMask…' : done ? 'Add to MetaMask again' : 'Show GAINS in MetaMask'}
          </button>
          <button type="button" className="w-full text-center text-xs text-muted underline underline-offset-2" onClick={onShowManualToken}>
            Add it manually instead
          </button>
        </div>
      );
    case 'gas':
      return done ? null : (
        <div className="flex gap-2">
          <a className="btn-primary flex-1" href={FAUCET_URL} target="_blank" rel="noreferrer">
            Open faucet ↗
          </a>
          <button type="button" className="btn-quiet shrink-0 px-4" onClick={onRecheck}>
            I&apos;ve got it
          </button>
        </div>
      );
    default:
      return null;
  }
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
            Pick a goal, a deadline and how much GAINS to put behind it. It&apos;s locked in a smart contract —
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
        The fee can never exceed 20%; that limit is written into the contract itself. Running on {chain.name}: GAINS
        here is test currency with no cash value.
      </p>
    </details>
  );
}

/**
 * Listing GAINS in MetaMask by hand — the fallback when the automatic request
 * fails, and always available. MetaMask only needs the contract address; it
 * reads the symbol and decimals from the chain itself.
 */
function ManualTokenImport({ onDone }: { onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(goalToken);
    } catch {
      // Older iOS without clipboard permission: select the text so a
      // long-press copy works instead.
      const el = document.getElementById('gains-token-address');
      const range = document.createRange();
      if (el) {
        range.selectNodeContents(el);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface p-3">
      <div>
        <p className="mb-1 text-xs font-medium text-muted">GAINS token address</p>
        <div className="flex items-center gap-2">
          <code
            id="gains-token-address"
            className="min-w-0 flex-1 break-all rounded-lg bg-card px-2 py-1.5 font-mono text-[11px] leading-snug"
          >
            {goalToken}
          </code>
          <button type="button" className="btn-primary shrink-0 px-3 text-sm" onClick={() => void copy()}>
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
        </div>
      </div>

      <ol className="list-decimal space-y-1 pl-4 text-xs">
        <li>Open MetaMask and make sure <strong>{chain.name}</strong> is the selected network.</li>
        <li>
          Tap <strong>Tokens</strong>, then <strong>Import tokens</strong> (at the bottom of the list, or under
          the ⋮ menu).
        </li>
        <li>
          Choose <strong>Custom token</strong> and paste the address. GAINS and 18 decimals fill in by themselves.
        </li>
        <li>
          Tap <strong>Next</strong>, then <strong>Import</strong>. Your GAINS balance appears.
        </li>
      </ol>

      <button type="button" className="btn-quiet w-full text-sm" onClick={onDone}>
        I&apos;ve added it
      </button>
    </div>
  );
}
