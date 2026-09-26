'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatEther, parseEther, type Address } from 'viem';
import { goalManagerAbi, goalTokenAbi } from '@/lib/chain/abis';
import {
  connect,
  ensureChain,
  goalManager,
  goalToken,
  hasWallet,
  publicClient,
  walletClient,
  chain,
} from '@/lib/chain/browser';
import { METRICS } from '@/lib/chain/metrics';
import { SkeletonBlock } from '@/components/Skeleton';

type Progress = { met: boolean; actual: number; target: number; detail: string };
type Goal = {
  id: string;
  goalId: number;
  metric: string;
  exerciseKey: string | null;
  target: number;
  deadline: string;
  progress: Progress;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function StakedGoals() {
  const [address, setAddress] = useState<Address | null>(null);
  const [linked, setLinked] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const loadGoals = useCallback(async () => {
    const res = await fetch('/api/chain/goals');
    if (res.ok) setGoals((await res.json()) as Goal[]);
  }, []);

  useEffect(() => {
    fetch('/api/chain/link-wallet')
      .then((r) => r.json())
      .then((d: { address: string | null }) => setLinked(d.address))
      .catch(() => {});
    void loadGoals();
  }, [loadGoals]);

  const refreshBalance = useCallback(async (who: Address) => {
    const value = await publicClient.readContract({
      address: goalToken,
      abi: goalTokenAbi,
      functionName: 'balanceOf',
      args: [who],
    });
    setBalance(value);
  }, []);

  async function onConnect() {
    setBusy('connect');
    setError(null);
    try {
      const who = await connect();
      await ensureChain();
      setAddress(who);
      await refreshBalance(who);

      // Linking is what lets the server find this person's goals later; the
      // connection alone is only a browser session.
      const res = await fetch('/api/chain/link-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: who }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not link that wallet.');
      setLinked(json.address);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect.');
    } finally {
      setBusy(null);
    }
  }

  /** Asks the server to re-check the logs and settle on-chain if they qualify. */
  async function claim(goal: Goal) {
    setBusy(`claim-${goal.goalId}`);
    setError(null);
    setNote(null);
    try {
      const res = await fetch('/api/chain/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: goal.goalId }),
      });
      const json = await res.json();
      if (json.settled) {
        setNote(`Settled on-chain — stake returned and reward minted. ${json.txHash.slice(0, 12)}…`);
        if (address) await refreshBalance(address);
      } else {
        setNote(json.error ?? `Not yet: ${json.verdict?.detail ?? 'target not reached.'}`);
      }
      await loadGoals();
    } catch {
      setError('Could not reach the verifier.');
    } finally {
      setBusy(null);
    }
  }

  if (!hasWallet()) {
    return (
      <p className="card text-sm text-muted">
        No wallet detected in this browser. Staking needs an injected wallet such as
        MetaMask — everything else in the app works without one.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="card text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      {note && <p className="card text-sm text-muted">{note}</p>}

      <section className="card">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {address ? 'Wallet connected' : linked ? 'Wallet linked' : 'No wallet linked'}
            </p>
            <p className="truncate text-xs tabular-nums text-muted">
              {address ?? linked ?? `Connect to stake on ${chain.name}`}
            </p>
            {balance !== null && (
              <p className="mt-1 text-xs tabular-nums text-muted">
                Balance <strong className="text-ink">{formatEther(balance)}</strong> GOAL
              </p>
            )}
          </div>
          {!address && (
            <button
              type="button"
              className="btn-quiet shrink-0 px-4"
              onClick={() => void onConnect()}
              disabled={busy === 'connect'}
            >
              {busy === 'connect' ? '…' : 'Connect'}
            </button>
          )}
        </div>
      </section>

      <CreateGoal
        address={address}
        onCreated={async () => {
          await loadGoals();
          if (address) await refreshBalance(address);
        }}
        onError={setError}
      />

      {goals === null ? (
        <SkeletonBlock className="h-32" />
      ) : goals.length === 0 ? (
        <p className="card text-sm text-muted">
          No staked goals yet. Stake tokens against something measurable and the app
          will check your own logs when you claim it.
        </p>
      ) : (
        <ul className="space-y-3">
          {goals.map((goal) => {
            const metric = METRICS.find((m) => m.key === goal.metric);
            const pct = Math.min(100, (goal.progress.actual / goal.progress.target) * 100);
            const overdue = new Date(goal.deadline).getTime() < Date.now();
            return (
              <li key={goal.id} className="card">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {metric?.label ?? goal.metric}
                    {goal.exerciseKey && (
                      <span className="font-normal text-muted"> · {goal.exerciseKey}</span>
                    )}
                  </p>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    #{goal.goalId}
                  </span>
                </div>

                <p className="mt-0.5 text-xs tabular-nums text-muted">
                  {goal.progress.actual} / {goal.progress.target} {metric?.unit ?? ''} ·{' '}
                  {overdue ? 'past deadline' : `by ${new Date(goal.deadline).toLocaleDateString()}`}
                </p>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
                  <div
                    className={`h-full rounded-full transition-[width] ${
                      goal.progress.met ? 'bg-accent' : 'bg-ink/35'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <p className="mt-2 text-xs text-muted">{goal.progress.detail}</p>

                <button
                  type="button"
                  className="btn-primary mt-3 w-full"
                  disabled={!goal.progress.met || busy === `claim-${goal.goalId}`}
                  onClick={() => void claim(goal)}
                >
                  {busy === `claim-${goal.goalId}`
                    ? 'Checking…'
                    : goal.progress.met
                      ? 'Claim — return stake and mint reward'
                      : 'Target not reached yet'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Staking is two transactions, and says so.
 *
 * ERC-20 requires an approval before the manager can move the stake. Hiding
 * that behind one button would mean a wallet popping up twice with no warning,
 * which reads as a bug the first time it happens.
 */
function CreateGoal({
  address,
  onCreated,
  onError,
}: {
  address: Address | null;
  onCreated: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [metric, setMetric] = useState<string>(METRICS[0].key);
  const [exerciseKey, setExerciseKey] = useState('');
  const [target, setTarget] = useState('5000');
  const [stake, setStake] = useState('10');
  const [days, setDays] = useState('28');
  const [step, setStep] = useState<'idle' | 'approving' | 'staking' | 'recording'>('idle');

  const definition = METRICS.find((m) => m.key === metric)!;

  async function submit() {
    if (!address) return onError('Connect a wallet first.');
    const stakeWei = parseEther(stake || '0');
    if (stakeWei <= 0n) return onError('Stake must be more than zero.');

    try {
      await ensureChain();
      const wallet = walletClient();
      const deadline = new Date(Date.now() + Number(days) * DAY_MS);
      const deadlineSec = BigInt(Math.floor(deadline.getTime() / 1000));

      setStep('approving');
      const approveHash = await wallet.writeContract({
        address: goalToken,
        abi: goalTokenAbi,
        functionName: 'approve',
        args: [goalManager, stakeWei],
        account: address,
        chain,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      setStep('staking');
      const description = `${definition.label}${exerciseKey ? ` · ${exerciseKey}` : ''} — ${target} ${definition.unit}`;
      const stakeHash = await wallet.writeContract({
        address: goalManager,
        abi: goalManagerAbi,
        functionName: 'createGoal',
        args: [description, BigInt(target || '0'), deadlineSec, stakeWei],
        account: address,
        chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: stakeHash });

      // The id comes from the event rather than a guess at the counter: two
      // people staking in the same block would otherwise both claim the same id.
      const created = receipt.logs
        .filter((l) => l.address.toLowerCase() === goalManager.toLowerCase())
        .map((l) => {
          try {
            return publicClient.chain && l.topics[1] ? BigInt(l.topics[1]) : null;
          } catch {
            return null;
          }
        })
        .find((id): id is bigint => id !== null);

      if (created === undefined) throw new Error('Staked, but the goal id could not be read.');

      setStep('recording');
      // Only after the chain confirms: a record here for a goal that does not
      // exist on-chain would be one the verifier could approve with nothing
      // staked behind it.
      const res = await fetch('/api/chain/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: Number(created),
          metric,
          exerciseKey: definition.needsExercise ? exerciseKey.trim().toLowerCase() || null : null,
          target: Number(target),
          deadline: deadline.toISOString(),
          txHash: stakeHash,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Staked, but could not record it.');

      await onCreated();
    } catch (e) {
      onError(e instanceof Error ? e.message.split('\n')[0] : 'Could not stake.');
    } finally {
      setStep('idle');
    }
  }

  return (
    <section className="card space-y-3">
      <p className="text-sm font-semibold">Stake on a goal</p>

      <label className="block">
        <span className="mb-1 block text-xs text-muted">What to measure</span>
        <select
          className="field w-full"
          value={metric}
          onChange={(e) => setMetric(e.target.value)}
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-muted">{definition.hint}</span>
      </label>

      {definition.needsExercise && (
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Exercise</span>
          <input
            className="field w-full"
            placeholder="bench press"
            value={exerciseKey}
            onChange={(e) => setExerciseKey(e.target.value)}
          />
        </label>
      )}

      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Target ({definition.unit})</span>
          <input
            className="field w-full"
            inputMode="numeric"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Days</span>
          <input
            className="field w-full"
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Stake (GOAL)</span>
          <input
            className="field w-full"
            inputMode="decimal"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
          />
        </label>
      </div>

      <button
        type="button"
        className="btn-primary w-full"
        disabled={!address || step !== 'idle'}
        onClick={() => void submit()}
      >
        {step === 'approving'
          ? 'Step 1 of 2 — approving…'
          : step === 'staking'
            ? 'Step 2 of 2 — staking…'
            : step === 'recording'
              ? 'Recording…'
              : address
                ? 'Stake'
                : 'Connect a wallet first'}
      </button>
    </section>
  );
}
