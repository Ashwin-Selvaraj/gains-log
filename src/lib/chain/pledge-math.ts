/**
 * The arithmetic behind the Pledges screen, with no I/O.
 *
 * Kept out of the component so the numbers a person bets on — what they get
 * back, whether they're on pace — are plain functions that can be checked in
 * isolation, and so the same outcome maths is used in the preview before a
 * pledge and the card after it.
 */

const BPS = 10_000n;

/** What each outcome pays, in wei, mirroring GoalManager exactly. */
export function outcomes(stake: bigint, rewardBps: number, feeBps: number) {
  const reward = (stake * BigInt(rewardBps)) / BPS;
  const fee = (stake * BigInt(feeBps)) / BPS;
  return {
    /** Stake back plus freshly minted reward. */
    hit: stake + reward,
    reward,
    /** Stake minus the platform fee. Never zero — failing costs the fee, not the stake. */
    miss: stake - fee,
    fee,
  };
}

export type Pace = {
  daysLeft: number;
  /** 0–1 share of the window that has elapsed. */
  elapsed: number;
  status: 'met' | 'ahead' | 'on-track' | 'behind' | 'out-of-reach' | 'ended';
  /** One line, in the user's terms. */
  line: string;
};

const DAY = 86_400_000;

/** "1 session", "2 sessions" — units are stored plural; kg has no plural. */
export function unitFor(n: number, unit: string): string {
  return n === 1 && unit.endsWith('s') ? unit.slice(0, -1) : unit;
}

/**
 * Where a pledge stands against the calendar, not just against its target.
 *
 * "7 of 12 sessions" doesn't tell you whether to worry; "on track" or "need 5
 * in 6 days" does. For day-counted metrics (sessions, protein days) you can
 * earn at most one per remaining day, which makes "out of reach" knowable in
 * advance — worth saying plainly so nobody grinds toward a goal that's gone.
 */
export function pace(
  p: { actual: number; target: number; met: boolean },
  startsAt: Date,
  deadline: Date,
  unit: string,
  perDayCap: boolean,
  now = new Date(),
): Pace {
  const total = Math.max(DAY, deadline.getTime() - startsAt.getTime());
  const elapsed = Math.min(1, Math.max(0, (now.getTime() - startsAt.getTime()) / total));
  const daysLeft = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / DAY));
  const remaining = Math.max(0, p.target - p.actual);

  if (p.met) return { daysLeft, elapsed, status: 'met', line: 'Target reached — claim your reward.' };
  if (daysLeft === 0) {
    return { daysLeft, elapsed, status: 'ended', line: `Ended ${remaining.toLocaleString()} ${unitFor(remaining, unit)} short.` };
  }
  if (perDayCap && remaining > daysLeft) {
    return {
      daysLeft,
      elapsed,
      status: 'out-of-reach',
      line: `Needs ${remaining} more ${unitFor(remaining, unit)} but only ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left.`,
    };
  }

  const expected = p.target * elapsed;
  const need = `${remaining.toLocaleString()} ${unitFor(remaining, unit)} in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`;
  if (p.actual >= expected * 1.1 && elapsed > 0.05) {
    return { daysLeft, elapsed, status: 'ahead', line: `Ahead of pace · ${need} to go.` };
  }
  if (p.actual >= expected) {
    return { daysLeft, elapsed, status: 'on-track', line: `On track · ${need} to go.` };
  }
  return { daysLeft, elapsed, status: 'behind', line: `Behind pace · need ${need}.` };
}

/**
 * Target suggestions scaled from a 28-day baseline to the chosen window.
 *
 * Three rungs — match, stretch, push — because the right bet is personal: a
 * stake on "what I already do" is free money, and one on double it is a
 * donation. Day-counted targets never exceed the number of days available.
 */
export function suggestTargets(
  baseline28: number,
  days: number,
  perDayCap: boolean,
): { label: string; value: number }[] {
  const scaled = (baseline28 * days) / 28;
  const cap = (n: number) => (perDayCap ? Math.min(days, n) : n);
  const round = (n: number) => (perDayCap ? Math.round(n) : Math.round(n / 100) * 100);

  const rungs = [
    { label: 'Match', value: cap(round(scaled)) },
    { label: 'Stretch', value: cap(round(scaled * 1.15)) },
    { label: 'Push', value: cap(round(scaled * 1.3)) },
  ].filter((r) => r.value > 0);

  // No history: offer sensible starting points instead of three zeroes.
  if (rungs.length === 0) {
    return perDayCap
      ? [
          { label: 'Easy', value: Math.max(1, Math.round(days * 0.3)) },
          { label: 'Solid', value: Math.max(1, Math.round(days * 0.45)) },
          { label: 'Hard', value: Math.max(1, Math.round(days * 0.6)) },
        ]
      : [];
  }
  // Collapse duplicates (small baselines round to the same number).
  return rungs.filter((r, i) => rungs.findIndex((x) => x.value === r.value) === i);
}
