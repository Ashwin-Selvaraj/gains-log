'use client';

import { formatEther } from 'viem';
import { explorerUrl } from '@/lib/chain/browser';
import { outcomes, pace, unitFor, type Pace } from '@/lib/chain/pledge-math';
import { kindOf } from '@/components/pledges/kinds';

export type Pledge = {
  id: string;
  goalId: number;
  metric: string;
  exerciseKey: string | null;
  target: number;
  startsAt: string;
  deadline: string;
  txHash: string | null;
  progress: { met: boolean; actual: number; target: number; detail: string };
  /** On-chain status; null when the chain couldn't be read. */
  status: 'None' | 'Active' | 'Succeeded' | 'Failed' | null;
  stakeAmount: string | null;
};

export type Rates = { rewardBps: number; feeBps: number };

const PACE_TONE: Record<Pace['status'], string> = {
  met: 'text-accent',
  ahead: 'text-accent',
  'on-track': 'text-accent',
  behind: 'text-amber-700 dark:text-amber-400',
  'out-of-reach': 'text-red-600 dark:text-red-400',
  ended: 'text-muted',
};

export function fmtGoal(wei: bigint): string {
  const n = Number(formatEther(wei));
  return n.toLocaleString(undefined, { maximumFractionDigits: n < 10 ? 2 : 0 });
}

export function titleOf(p: Pledge): string {
  const kind = kindOf(p.metric);
  if (!p.exerciseKey) return kind.title;
  return `${kind.title} · ${p.exerciseKey[0].toUpperCase()}${p.exerciseKey.slice(1)}`;
}

/**
 * One live pledge. Leads with the question people actually have — "am I going
 * to make it?" — before the raw numbers, and shows what's on the line so the
 * stake stays motivating instead of forgotten.
 */
export function PledgeCard({
  pledge,
  rates,
  busy,
  onClaim,
  onSettle,
}: {
  pledge: Pledge;
  rates: Rates | null;
  busy: boolean;
  onClaim: () => void;
  onSettle: () => void;
}) {
  const kind = kindOf(pledge.metric);
  const p = pace(
    pledge.progress,
    new Date(pledge.startsAt),
    new Date(pledge.deadline),
    kind.unit,
    kind.perDayCap,
  );
  const stake = pledge.stakeAmount ? BigInt(pledge.stakeAmount) : null;
  const money = stake !== null && rates ? outcomes(stake, rates.rewardBps, rates.feeBps) : null;
  const pct = Math.min(100, (pledge.progress.actual / Math.max(1, pledge.progress.target)) * 100);
  const ended = p.daysLeft === 0;
  const tx = pledge.txHash ? explorerUrl('tx', pledge.txHash) : null;

  return (
    <li className="card">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-xl"
        >
          {kind.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{titleOf(pledge)}</p>
          <p className="text-xs text-muted">
            {ended
              ? `Ended ${new Date(pledge.deadline).toLocaleDateString()}`
              : `${p.daysLeft} ${p.daysLeft === 1 ? 'day' : 'days'} left · ends ${new Date(
                  pledge.deadline,
                ).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
          </p>
        </div>
        {stake !== null && (
          <span className="shrink-0 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold tabular-nums text-accent">
            {fmtGoal(stake)} GOAL
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <p className="text-2xl font-bold tabular-nums leading-none">
          {pledge.progress.actual.toLocaleString()}
          <span className="ml-1 text-sm font-normal text-muted">
            / {pledge.progress.target.toLocaleString()} {unitFor(pledge.progress.target, kind.unit)}
          </span>
        </p>
        <p className="text-xs tabular-nums text-muted">{Math.round(pct)}%</p>
      </div>

      {/* The tick marks where you'd be if you spread the work evenly — the bar
          alone can't tell "40% done" apart from "40% done and 80% of the time
          gone". */}
      <div className="relative mt-2 h-2.5 rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${
            p.status === 'behind' || p.status === 'out-of-reach' ? 'bg-amber-500' : 'bg-accent'
          }`}
          style={{ width: `${pct}%` }}
        />
        {!pledge.progress.met && !ended && (
          <span
            aria-hidden
            className="absolute -top-1 h-[18px] w-0.5 rounded-full bg-ink/60"
            style={{ left: `${Math.min(100, p.elapsed * 100)}%` }}
            title="Where you'd be on an even pace"
          />
        )}
      </div>

      <p className={`mt-2 text-sm font-medium ${PACE_TONE[p.status]}`}>{p.line}</p>

      {money && (
        <p className="mt-1 text-xs text-muted">
          Hit it: <strong className="text-ink">{fmtGoal(money.hit)}</strong> back (+
          {fmtGoal(money.reward)}) · Miss it: {fmtGoal(money.miss)} back
        </p>
      )}

      {pledge.status === 'Active' && pledge.progress.met && (
        <button
          type="button"
          className="btn-primary mt-3 w-full"
          disabled={busy}
          onClick={onClaim}
        >
          {busy ? 'Checking your logs…' : `Claim ${money ? fmtGoal(money.hit) : ''} GOAL`}
        </button>
      )}

      {pledge.status === 'Active' && !pledge.progress.met && ended && (
        <button type="button" className="btn-quiet mt-3 w-full" disabled={busy} onClick={onSettle}>
          {busy ? 'Closing…' : `Close pledge · get ${money ? fmtGoal(money.miss) : 'your stake'} back`}
        </button>
      )}

      {pledge.status === null && (
        <p className="mt-2 text-xs text-muted">Couldn&apos;t reach the network to confirm this pledge&apos;s status.</p>
      )}

      {tx && (
        <a
          href={tx}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-[11px] text-muted underline decoration-line underline-offset-2"
        >
          Pledge #{pledge.goalId} on the blockchain ↗
        </a>
      )}
    </li>
  );
}
