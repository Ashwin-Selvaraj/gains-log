'use client';

import { useState } from 'react';
import { CATEGORY_LABEL, type Category, type Progress, type QuestView } from '@/lib/rewards';

export type RewardsData = {
  today: string;
  enabled: boolean;
  walletLinked: boolean;
  streak: { current: number; longest: number };
  earned: number;
  quests: QuestView[];
  leaderboard: {
    month: string;
    top: { rank: number; name: string; earned: number; you: boolean }[];
    you: { rank: number; earned: number } | null;
    players: number;
  };
};

const REPEAT_LABEL: Record<QuestView['repeat'], string> = {
  once: 'One-time',
  daily: 'Every day',
  weekly: 'Every week',
  season: 'Season challenge',
};

const FILTERS: ('all' | Category)[] = ['all', 'streak', 'fuel', 'iron', 'pledge'];

/** Ready first, then whatever's closest to done; finished one-offs sink. */
function rank(q: QuestView): number {
  if (q.claimable.length > 0) return 3;
  const done = q.repeat === 'once' && q.claimedNow;
  if (done) return -1;
  const pct = Math.min(...q.progress.map((p) => p.current / p.target));
  return pct;
}

/**
 * The "Earn GOAL" side of the Pledges tab.
 *
 * Pledges ask you to risk tokens; quests just pay you for showing up. Both are
 * here because the second is how most people will get enough GOAL to try the
 * first — and because a list of things you're one day away from is the best
 * reason to log today.
 */
export function Rewards({
  data,
  onChanged,
}: {
  data: RewardsData | null;
  onChanged: (message?: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState<'all' | Category>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!data) {
    return <div className="card h-40 animate-pulse" aria-busy />;
  }

  async function claim(q: QuestView) {
    const period = q.claimable[0];
    setBusy(q.key);
    setError(null);
    try {
      const res = await fetch('/api/rewards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ruleKey: q.key, periodKey: period.periodKey, today: data!.today }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not claim that.');
      await onChanged(`${json.emoji} +${json.amount} GOAL — ${json.title}${period.label ? ` (${period.label.toLowerCase()})` : ''}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not claim that.');
    } finally {
      setBusy(null);
    }
  }

  const season = data.quests.find((q) => q.category === 'season');
  const rest = data.quests
    .filter((q) => q.category !== 'season')
    .filter((q) => filter === 'all' || q.category === filter)
    .sort((a, b) => rank(b) - rank(a));
  const ready = data.quests.filter((q) => q.claimable.length > 0);
  const readyTotal = ready.reduce((sum, q) => sum + q.amount, 0);
  const canClaim = data.enabled && data.walletLinked;

  return (
    <div className="space-y-4">
      {/* ── Scoreboard ─────────────────────────────────────────────────── */}
      <section className="card">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[11px] text-muted">Earned from quests</p>
            <p className="text-xl font-bold tabular-nums text-accent">+{data.earned}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">Current streak</p>
            <p className="text-xl font-bold tabular-nums">
              {data.streak.current}
              <span className="ml-0.5 text-sm">🔥</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{data.leaderboard.month} rank</p>
            <p className="text-xl font-bold tabular-nums">
              {data.leaderboard.you ? `#${data.leaderboard.you.rank}` : '—'}
            </p>
          </div>
        </div>
        {ready.length > 0 && (
          <p className="mt-3 rounded-xl bg-accent/10 px-3 py-2 text-center text-sm font-medium text-accent">
            {ready.length} {ready.length === 1 ? 'reward' : 'rewards'} ready · +{readyTotal} GOAL waiting
          </p>
        )}
        {!canClaim && (
          <p className="mt-3 text-center text-xs text-muted">
            {data.enabled
              ? 'Connect a wallet on the Pledges side to collect what you earn — progress counts either way.'
              : "Rewards aren't switched on for this deployment — progress still shows."}
          </p>
        )}
      </section>

      {error && (
        <p className="rounded-2xl border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}

      {/* ── Season ─────────────────────────────────────────────────────── */}
      {season && (
        <SeasonCard quest={season} today={data.today} canClaim={canClaim} busy={busy === season.key} onClaim={() => void claim(season)} />
      )}

      {/* ── Quests ─────────────────────────────────────────────────────── */}
      <section aria-label="Quests">
        <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm font-medium transition ${
                filter === f ? 'border-ink bg-ink text-card' : 'border-line bg-card text-muted'
              }`}
            >
              {f === 'all' ? 'All' : CATEGORY_LABEL[f]}
            </button>
          ))}
        </div>
        <ul className="space-y-2.5">
          {rest.map((q) => (
            <QuestCard key={q.key} quest={q} canClaim={canClaim} busy={busy === q.key} onClaim={() => void claim(q)} />
          ))}
        </ul>
      </section>

      <Leaderboard board={data.leaderboard} />

      <p className="px-2 text-center text-[11px] text-muted">
        Every quest is checked against your own logs before it pays. Dailies stay claimable until the end of
        the next day, weeklies until the end of the next week.
      </p>
    </div>
  );
}

function Bars({ progress, tone = 'accent' }: { progress: Progress[]; tone?: 'accent' | 'ice' }) {
  return (
    <div className="space-y-1.5">
      {progress.map((p) => {
        const pct = Math.min(100, (p.current / p.target) * 100);
        return (
          <div key={p.label}>
            <div className="flex justify-between text-[11px] text-muted">
              <span>{p.label}</span>
              <span className="tabular-nums">
                {p.current.toLocaleString()} / {p.target.toLocaleString()} {p.unit}
              </span>
            </div>
            <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  tone === 'ice' ? 'bg-sky-500' : 'bg-accent'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ClaimButton({
  quest,
  canClaim,
  busy,
  onClaim,
}: {
  quest: QuestView;
  canClaim: boolean;
  busy: boolean;
  onClaim: () => void;
}) {
  if (quest.claimable.length === 0) return null;
  const label = quest.claimable[0].label;
  return (
    <button
      type="button"
      className="btn-primary mt-3 w-full"
      disabled={!canClaim || busy}
      onClick={onClaim}
    >
      {busy ? 'Paying out…' : `Claim +${quest.amount} GOAL${label ? ` · ${label.toLowerCase()}` : ''}`}
    </button>
  );
}

function QuestCard({
  quest,
  canClaim,
  busy,
  onClaim,
}: {
  quest: QuestView;
  canClaim: boolean;
  busy: boolean;
  onClaim: () => void;
}) {
  const ready = quest.claimable.length > 0;
  const finished = quest.repeat === 'once' && quest.claimedNow;
  const repeatDone = quest.repeat !== 'once' && quest.claimedNow && !ready;

  return (
    <li
      className={`card transition ${ready ? 'border-accent/60 ring-2 ring-accent/15' : ''} ${
        finished ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${
            ready ? 'animate-bounce bg-accent/10 [animation-iteration-count:2]' : 'bg-surface'
          }`}
        >
          {finished ? '✅' : quest.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold leading-tight">{quest.title}</p>
            <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold tabular-nums text-accent">
              +{quest.amount}
            </span>
          </div>
          <p className="mt-0.5 text-xs">{quest.how}</p>
          <p className="mt-0.5 text-xs italic text-muted">{quest.quip}</p>
        </div>
      </div>

      {!finished && (
        <div className="mt-3">
          <Bars progress={quest.progress} />
        </div>
      )}

      <p className="mt-2 text-[11px] text-muted">
        {REPEAT_LABEL[quest.repeat]}
        {quest.periodLabel && ` · ${quest.periodLabel.toLowerCase()}`}
        {finished && ' · unlocked'}
        {repeatDone && ' · claimed — back again next time'}
        {quest.repeat !== 'once' && quest.timesClaimed > 0 && ` · won ${quest.timesClaimed}×`}
      </p>

      <ClaimButton quest={quest} canClaim={canClaim} busy={busy} onClaim={onClaim} />
    </li>
  );
}

function SeasonCard({
  quest,
  today,
  canClaim,
  busy,
  onClaim,
}: {
  quest: QuestView;
  today: string;
  canClaim: boolean;
  busy: boolean;
  onClaim: () => void;
}) {
  const end = quest.window?.end ?? today;
  const daysLeft = Math.max(
    0,
    Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000) + 1,
  );
  const done = quest.claimedNow;

  return (
    <section
      aria-label={quest.title}
      className="overflow-hidden rounded-2xl border border-sky-500/40 bg-gradient-to-br from-sky-500/15 via-card to-indigo-500/10 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">
            Season challenge · {done ? 'conquered' : daysLeft > 0 ? `${daysLeft} days left` : 'ended'}
          </p>
          <p className="mt-1 text-xl font-bold">
            {quest.emoji} {quest.title}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-sky-500/15 px-2.5 py-1 text-sm font-bold tabular-nums text-sky-700 dark:text-sky-300">
          +{quest.amount}
        </span>
      </div>
      <p className="mt-1 text-sm">{quest.how}</p>
      <p className="mt-0.5 text-xs italic text-muted">{quest.quip}</p>
      {!done && (
        <div className="mt-3">
          <Bars progress={quest.progress} tone="ice" />
        </div>
      )}
      <ClaimButton quest={quest} canClaim={canClaim} busy={busy} onClaim={onClaim} />
    </section>
  );
}

function Leaderboard({ board }: { board: RewardsData['leaderboard'] }) {
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <section className="card" aria-label="Leaderboard">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">GOAL Getters · {board.month}</h2>
        <span className="text-xs text-muted">from quests</span>
      </div>
      {board.top.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Nobody&apos;s on the board yet this month. First claim takes the crown. 👑
        </p>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {board.top.map((row) => (
            <li
              key={row.rank}
              className={`flex items-center gap-3 py-2 text-sm ${row.you ? 'font-semibold' : ''}`}
            >
              <span className="w-6 text-center tabular-nums">{medal[row.rank - 1] ?? row.rank}</span>
              <span className="min-w-0 flex-1 truncate">
                {row.name}
                {row.you && <span className="ml-1.5 text-xs font-normal text-accent">you</span>}
              </span>
              <span className="tabular-nums text-accent">+{row.earned}</span>
            </li>
          ))}
        </ol>
      )}
      {board.you && board.you.rank > 10 && (
        <p className="mt-2 border-t border-line pt-2 text-sm">
          You&apos;re #{board.you.rank} of {board.players} with +{board.you.earned}. Climb.
        </p>
      )}
    </section>
  );
}
