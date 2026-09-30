'use client';

import { useMemo, useState } from 'react';
import { parseEther, parseEventLogs, type Address } from 'viem';
import { goalManagerAbi, goalTokenAbi } from '@/lib/chain/abis';
import {
  chain,
  ensureChain,
  friendlyError,
  goalManager,
  goalToken,
  publicClient,
  walletClient,
} from '@/lib/chain/browser';
import { outcomes, suggestTargets } from '@/lib/chain/pledge-math';
import { nameKeyOf } from '@/lib/exercises';
import type { MetricKey } from '@/lib/chain/metrics';
import { ExercisePicker } from '@/components/ExercisePicker';
import { KINDS, ORDER, kindOf } from '@/components/pledges/kinds';
import { fmtGoal, type Rates } from '@/components/pledges/PledgeCard';

export type Baseline = {
  windowDays: number;
  sessions: number;
  proteinDays: number;
  lifts: { key: string; name: string; volume: number }[];
};

const DURATIONS = [
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 28, label: '4 weeks' },
];
const STAKES = [5, 10, 25, 50];
const DAY_MS = 86_400_000;

type Step = 'idle' | 'approving' | 'staking' | 'recording';

/**
 * Making a pledge, as three decisions: what, how much by when, and what's on
 * the line.
 *
 * Every default comes from the person's own last four weeks, and the outcome
 * of both results is shown before they commit — a stake only changes
 * behaviour if you know exactly what you stand to gain and lose.
 */
export function PledgeComposer({
  address,
  balance,
  baseline,
  rates,
  onDone,
  onCancel,
}: {
  address: Address;
  balance: bigint;
  baseline: Baseline | null;
  rates: Rates | null;
  onDone: (message: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [metric, setMetric] = useState<MetricKey>('sessions');
  const [lift, setLift] = useState<{ key: string; name: string } | null>(
    baseline?.lifts[0] ? { key: baseline.lifts[0].key, name: baseline.lifts[0].name } : null,
  );
  const [pickingLift, setPickingLift] = useState(false);
  const [days, setDays] = useState(14);
  const [target, setTarget] = useState<number | null>(null);
  const [stake, setStake] = useState(10);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);

  const kind = kindOf(metric);

  const base28 = useMemo(() => {
    if (!baseline) return 0;
    if (metric === 'sessions') return baseline.sessions;
    if (metric === 'protein_days') return baseline.proteinDays;
    return baseline.lifts.find((l) => l.key === lift?.key)?.volume ?? 0;
  }, [baseline, metric, lift]);

  const suggestions = suggestTargets(base28, days, kind.perDayCap);
  // The middle rung ("Stretch") unless the user has picked something.
  const effectiveTarget = target ?? suggestions[1]?.value ?? suggestions[0]?.value ?? 0;

  const stakeWei = parseEther(String(stake));
  const money = rates ? outcomes(stakeWei, rates.rewardBps, rates.feeBps) : null;
  const affordable = stakeWei <= balance;

  const problem =
    kind.needsExercise && !lift
      ? 'Pick the lift this pledge is about.'
      : effectiveTarget <= 0
        ? 'Set a target above zero.'
        : kind.perDayCap && effectiveTarget > days
          ? `You can't log more than ${days} ${kind.unit} in ${days} days.`
          : !affordable
            ? `You have ${fmtGoal(balance)} GOAL — pick a smaller stake.`
            : null;

  function choose(next: MetricKey) {
    setMetric(next);
    setTarget(null);
    setError(null);
  }

  async function submit() {
    if (problem) return;
    setError(null);
    try {
      await ensureChain();
      const wallet = walletClient();
      const deadline = new Date(Date.now() + days * DAY_MS);

      // Skip the approval when an earlier one already covers this stake — one
      // wallet prompt instead of two.
      const allowance = await publicClient.readContract({
        address: goalToken,
        abi: goalTokenAbi,
        functionName: 'allowance',
        args: [address, goalManager],
      });
      if (allowance < stakeWei) {
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
      }

      setStep('staking');
      const what = lift && kind.needsExercise ? ` · ${lift.name}` : '';
      const stakeHash = await wallet.writeContract({
        address: goalManager,
        abi: goalManagerAbi,
        functionName: 'createGoal',
        args: [
          `${kind.title}${what} — ${effectiveTarget} ${kind.unit} in ${days} days`,
          BigInt(effectiveTarget),
          BigInt(Math.floor(deadline.getTime() / 1000)),
          stakeWei,
        ],
        account: address,
        chain,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: stakeHash });

      // Read the id from the event rather than guessing the counter: two
      // pledges in the same block would otherwise claim the same id.
      const [created] = parseEventLogs({
        abi: goalManagerAbi,
        eventName: 'GoalCreated',
        logs: receipt.logs,
      });
      if (!created) throw new Error('Pledged on-chain, but the pledge id could not be read.');

      setStep('recording');
      const res = await fetch('/api/chain/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: Number(created.args.goalId),
          metric,
          exerciseKey: kind.needsExercise && lift ? lift.key : null,
          target: effectiveTarget,
          deadline: deadline.toISOString(),
          txHash: stakeHash,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Pledged, but could not save it.');

      await onDone(`Pledge locked in — ${stake} GOAL on ${kind.title.toLowerCase()}. Go get it.`);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setStep('idle');
    }
  }

  const working = step !== 'idle';

  return (
    <section className="card space-y-5" aria-label="New pledge">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">New pledge</h2>
        <button type="button" className="text-sm text-muted" onClick={onCancel} disabled={working}>
          Cancel
        </button>
      </div>

      {/* ── 1. What ─────────────────────────────────────────────────────── */}
      <fieldset>
        <legend className="label">1 · What are you committing to?</legend>
        <div className="grid grid-cols-3 gap-2">
          {ORDER.map((key) => {
            const k = KINDS[key];
            const on = metric === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => choose(key)}
                className={`rounded-xl border p-2.5 text-left transition ${
                  on ? 'border-accent bg-accent/5 ring-2 ring-accent/25' : 'border-line bg-surface'
                }`}
              >
                <span aria-hidden className="text-xl">
                  {k.icon}
                </span>
                <span className="mt-1 block text-sm font-semibold">{k.title}</span>
                <span className="block text-[11px] leading-snug text-muted">{k.pitch}</span>
              </button>
            );
          })}
        </div>

        {kind.needsExercise && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs text-muted">Which lift?</p>
            <div className="flex flex-wrap gap-1.5">
              {baseline?.lifts.map((l) => (
                <Chip
                  key={l.key}
                  on={lift?.key === l.key}
                  onClick={() => {
                    setLift({ key: l.key, name: l.name });
                    setTarget(null);
                  }}
                >
                  {l.name}
                </Chip>
              ))}
              {lift && !baseline?.lifts.some((l) => l.key === lift.key) && (
                <Chip on onClick={() => {}}>
                  {lift.name}
                </Chip>
              )}
              <Chip on={false} onClick={() => setPickingLift(true)}>
                + Other lift
              </Chip>
            </div>
            {pickingLift && (
              <ExercisePicker
                onCancel={() => setPickingLift(false)}
                onPick={(name) => {
                  setLift({ key: nameKeyOf(name), name });
                  setTarget(null);
                  setPickingLift(false);
                }}
              />
            )}
          </div>
        )}
      </fieldset>

      {/* ── 2. How much, by when ───────────────────────────────────────── */}
      <fieldset>
        <legend className="label">2 · How much, and by when?</legend>
        <div className="mb-3 flex gap-1.5">
          {DURATIONS.map((d) => (
            <Chip
              key={d.days}
              on={days === d.days}
              onClick={() => {
                setDays(d.days);
                setTarget(null);
              }}
            >
              {d.label}
            </Chip>
          ))}
        </div>

        {suggestions.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {suggestions.map((s) => (
              <button
                key={s.label}
                type="button"
                aria-pressed={effectiveTarget === s.value}
                onClick={() => setTarget(s.value)}
                className={`rounded-xl border px-2 py-2 text-center transition ${
                  effectiveTarget === s.value
                    ? 'border-accent bg-accent/5 ring-2 ring-accent/25'
                    : 'border-line bg-surface'
                }`}
              >
                <span className="block text-lg font-bold tabular-nums leading-tight">
                  {s.value.toLocaleString()}
                </span>
                <span className="block text-[11px] text-muted">
                  {s.label} · {kind.unit}
                </span>
              </button>
            ))}
          </div>
        )}

        <label className="mt-2 flex items-center gap-2">
          <span className="shrink-0 text-xs text-muted">Custom</span>
          <input
            className="field py-2"
            inputMode="numeric"
            placeholder={String(effectiveTarget || '')}
            value={target !== null && !suggestions.some((s) => s.value === target) ? target : ''}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[^\d]/g, ''));
              setTarget(Number.isFinite(n) && n > 0 ? n : null);
            }}
            aria-label={`Custom target in ${kind.unit}`}
          />
          <span className="shrink-0 text-xs text-muted">{kind.unit}</span>
        </label>

        <p className="mt-1.5 text-xs text-muted">
          {base28 > 0
            ? `Your last 4 weeks: ${base28.toLocaleString()} ${kind.unit}. `
            : 'No history for this yet — start achievable. '}
          Pick something you&apos;ll have to work for, but can hit.
        </p>
      </fieldset>

      {/* ── 3. What's on the line ──────────────────────────────────────── */}
      <fieldset>
        <legend className="label">3 · What&apos;s on the line?</legend>
        <div className="flex items-center gap-1.5">
          {STAKES.map((s) => (
            <Chip key={s} on={stake === s} disabled={parseEther(String(s)) > balance} onClick={() => setStake(s)}>
              {s}
            </Chip>
          ))}
          <span className="ml-1 text-sm text-muted">GOAL</span>
        </div>

        {money && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl border border-accent/40 bg-accent/5 p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-accent">Hit it</p>
              <p className="text-xl font-bold tabular-nums">{fmtGoal(money.hit)}</p>
              <p className="text-[11px] text-muted">back · +{fmtGoal(money.reward)} earned</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Miss it</p>
              <p className="text-xl font-bold tabular-nums">{fmtGoal(money.miss)}</p>
              <p className="text-[11px] text-muted">back · {fmtGoal(money.fee)} fee</p>
            </div>
          </div>
        )}
      </fieldset>

      {(problem || error) && (
        <p className={`text-sm ${error ? 'text-red-600 dark:text-red-400' : 'text-muted'}`}>
          {error ?? problem}
        </p>
      )}

      <button
        type="button"
        className="btn-primary w-full"
        disabled={!!problem || working}
        onClick={() => void submit()}
      >
        {step === 'approving'
          ? 'Step 1 of 2 · Approve in your wallet…'
          : step === 'staking'
            ? 'Step 2 of 2 · Confirm the pledge…'
            : step === 'recording'
              ? 'Saving…'
              : `Pledge ${stake} GOAL`}
      </button>
      <p className="-mt-3 text-center text-[11px] text-muted">
        Your wallet will ask you to confirm. Your own logs decide the result.
      </p>
    </section>
  );
}

function Chip({
  on,
  disabled,
  onClick,
  children,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition disabled:opacity-35 ${
        on ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink'
      }`}
    >
      {children}
    </button>
  );
}
