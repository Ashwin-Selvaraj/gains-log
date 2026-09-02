/**
 * Personal-record maths. Deliberately pure — no Prisma, no fetch, no React.
 *
 * Records are always *derived* from the set log, never stored. A materialised
 * PR table would need invalidating on every set edit or delete, and a stale
 * record is worse than no record. Recomputing a year of one person's training
 * is microseconds; correctness is free.
 *
 * Everything here takes plain arrays and returns plain objects, so it can be
 * called from an API route, the report builder, or a component without change.
 */

import { daysBetween, isoWeekKey, type DateKey } from '@/lib/date';

export type SetLike = {
  id: string;
  /** Display name, as the user typed it. */
  exercise: string;
  exerciseKey: string;
  reps: number;
  /** Null for bodyweight work — pull-ups, dips. */
  weightKg: number | null;
  date: DateKey;
};

export type PRKind = 'heaviest' | 'e1rm' | 'reps';

export type RecordMark = {
  setId: string;
  weightKg: number | null;
  reps: number;
  est1RM: number | null;
  date: DateKey;
};

export type ExerciseRecords = {
  key: string;
  /** The most recently used spelling, so the UI shows what you last typed. */
  name: string;
  /** True when nothing has ever been logged with a weight. */
  bodyweight: boolean;
  heaviest: RecordMark | null;
  best1RM: RecordMark | null;
  bestReps: RecordMark | null;
  /** Heaviest set achieved for at least N reps, for the buckets below. */
  bestPerRep: { minReps: number; mark: RecordMark }[];
  totals: { sessions: number; sets: number; reps: number; volumeKg: number };
  firstDate: DateKey | null;
  lastDate: DateKey | null;
  daysSinceLast: number | null;
  weeksTrained: number;
  /** Consecutive ISO weeks with at least one set, counting back from today. */
  weekStreak: number;
};

/** Rep buckets for the "best per rep" table. */
export const REP_BUCKETS = [1, 3, 5, 8, 10, 12] as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Collapses the spellings of one exercise onto a single identity.
 * "Bench Press", "bench  press" and " Bench press " are the same lift; without
 * this they would each keep their own private set of records.
 */
export function exerciseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Epley: a one-rep-max estimate from a set taken near failure. Lets a 5×100kg
 * set be compared against a 1×105kg one, which raw weight can't do.
 * Returns null for bodyweight sets, where there is no load to extrapolate from.
 */
export function estimate1RM(weightKg: number | null, reps: number): number | null {
  if (weightKg === null || weightKg <= 0 || reps < 1) return null;
  return round1(weightKg * (1 + reps / 30));
}

function toMark(s: SetLike): RecordMark {
  return {
    setId: s.id,
    weightKg: s.weightKg,
    reps: s.reps,
    est1RM: estimate1RM(s.weightKg, s.reps),
    date: s.date,
  };
}

/** Later date wins ties on equal performance, so "when" reflects the first time it was hit. */
function betterHeaviest(a: SetLike, b: SetLike): SetLike {
  const aw = a.weightKg ?? -1;
  const bw = b.weightKg ?? -1;
  if (aw !== bw) return aw > bw ? a : b;
  return a.reps >= b.reps ? a : b;
}

/**
 * All records for one exercise. `sets` must all belong to the same exerciseKey;
 * pass `today` so the week streak knows whether the current week is still live.
 */
export function computeRecords(
  sets: SetLike[],
  today: DateKey,
): ExerciseRecords | null {
  if (sets.length === 0) return null;

  const ordered = [...sets].sort((a, b) => a.date.localeCompare(b.date));
  const withWeight = ordered.filter((s) => s.weightKg !== null && s.weightKg > 0);
  const bodyweight = withWeight.length === 0;

  const heaviest = withWeight.length
    ? toMark(withWeight.reduce(betterHeaviest))
    : null;

  const best1RM = withWeight.length
    ? toMark(
        withWeight.reduce((a, b) =>
          (estimate1RM(a.weightKg, a.reps) ?? 0) >= (estimate1RM(b.weightKg, b.reps) ?? 0)
            ? a
            : b,
        ),
      )
    : null;

  // Rep PRs matter for everything, but they're the *only* PR a bodyweight lift has.
  const bestReps = toMark(
    ordered.reduce((a, b) => (a.reps >= b.reps ? a : b)),
  );

  const bestPerRep: { minReps: number; mark: RecordMark }[] = [];
  for (const minReps of REP_BUCKETS) {
    const eligible = withWeight.filter((s) => s.reps >= minReps);
    if (eligible.length) {
      bestPerRep.push({ minReps, mark: toMark(eligible.reduce(betterHeaviest)) });
    }
  }

  const sessionDates = [...new Set(ordered.map((s) => s.date))];
  const weeks = new Set(ordered.map((s) => isoWeekKey(s.date)));

  // Walk back week by week from today; the first gap ends the streak. The
  // current week not being trained yet doesn't break it — only a missed one does.
  let weekStreak = 0;
  for (let i = 0; i < 520; i++) {
    const probe = shiftWeeks(today, -i);
    if (weeks.has(isoWeekKey(probe))) weekStreak++;
    else if (i > 0) break;
  }

  const firstDate = sessionDates[0];
  const lastDate = sessionDates[sessionDates.length - 1];

  return {
    key: ordered[0].exerciseKey,
    name: ordered[ordered.length - 1].exercise,
    bodyweight,
    heaviest,
    best1RM,
    bestReps,
    bestPerRep,
    totals: {
      sessions: sessionDates.length,
      sets: ordered.length,
      reps: ordered.reduce((n, s) => n + s.reps, 0),
      volumeKg: Math.round(
        ordered.reduce((n, s) => n + s.reps * (s.weightKg ?? 0), 0),
      ),
    },
    firstDate,
    lastDate,
    daysSinceLast: daysBetween(lastDate, today),
    weeksTrained: weeks.size,
    weekStreak,
  };
}

function shiftWeeks(key: DateKey, delta: number): DateKey {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d + delta * 7);
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** Records for every exercise present in `sets`, keyed by exerciseKey. */
export function recordsByExercise(
  sets: SetLike[],
  today: DateKey,
): Map<string, ExerciseRecords> {
  const grouped = new Map<string, SetLike[]>();
  for (const s of sets) {
    const list = grouped.get(s.exerciseKey) ?? [];
    list.push(s);
    grouped.set(s.exerciseKey, list);
  }

  const out = new Map<string, ExerciseRecords>();
  for (const [key, list] of grouped) {
    const rec = computeRecords(list, today);
    if (rec) out.set(key, rec);
  }
  return out;
}

/**
 * Which sets were records *at the moment they were performed*. Walks forward
 * keeping running bests, so a set only counts as a PR if nothing before it was
 * already better — which is what makes the badge meaningful in hindsight.
 */
export function markPRs(sets: SetLike[]): Map<string, PRKind[]> {
  const marks = new Map<string, PRKind[]>();
  const running = new Map<
    string,
    { heaviest: number; e1rm: number; reps: number }
  >();

  const ordered = [...sets].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );

  for (const s of ordered) {
    const best = running.get(s.exerciseKey) ?? { heaviest: 0, e1rm: 0, reps: 0 };
    const kinds: PRKind[] = [];

    const w = s.weightKg ?? 0;
    const e = estimate1RM(s.weightKg, s.reps) ?? 0;

    if (w > best.heaviest) {
      kinds.push('heaviest');
      best.heaviest = w;
    }
    if (e > best.e1rm) {
      kinds.push('e1rm');
      best.e1rm = e;
    }
    // A rep PR is only interesting on its own for unweighted work; with a
    // barbell, more reps at a lighter load isn't a record worth flagging.
    if (s.reps > best.reps) {
      if (s.weightKg === null) kinds.push('reps');
      best.reps = s.reps;
    }

    running.set(s.exerciseKey, best);
    if (kinds.length) marks.set(s.id, kinds);
  }

  return marks;
}

/** One point per training day: the best estimated 1RM achieved that day. */
export function oneRepMaxSeries(sets: SetLike[]): { date: DateKey; value: number }[] {
  const byDate = new Map<DateKey, number>();
  for (const s of sets) {
    const e = estimate1RM(s.weightKg, s.reps);
    if (e === null) continue;
    byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, e));
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Best single set per training day — the series for bodyweight lifts. */
export function repsSeries(sets: SetLike[]): { date: DateKey; value: number }[] {
  const byDate = new Map<DateKey, number>();
  for (const s of sets) {
    byDate.set(s.date, Math.max(byDate.get(s.date) ?? 0, s.reps));
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type Session = { date: DateKey; sets: SetLike[]; volumeKg: number };

/** Sets grouped into training days, most recent first. */
export function toSessions(sets: SetLike[]): Session[] {
  const byDate = new Map<DateKey, SetLike[]>();
  for (const s of sets) {
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);
  }
  return [...byDate.entries()]
    .map(([date, list]) => ({
      date,
      sets: list,
      volumeKg: Math.round(list.reduce((n, s) => n + s.reps * (s.weightKg ?? 0), 0)),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * The most recent session strictly before `before` — "what did I do last time?",
 * which is the question this whole feature exists to answer.
 */
export function lastSessionBefore(sets: SetLike[], before: DateKey): Session | null {
  const prior = sets.filter((s) => s.date < before);
  return toSessions(prior)[0] ?? null;
}

/* ── Live PR detection, for the moment a set is logged ───────────────────── */

export type PRAchievement = {
  exercise: string;
  /** 'first' is the first time this lift has ever been logged. */
  kind: 'weight' | 'e1rm' | 'reps' | 'first';
  value: number;
  /** The mark that was beaten. Null on a first-ever log. */
  previous: number | null;
  unit: 'kg' | 'reps';
};

/**
 * Did the set just logged beat anything?
 *
 * Compared against the running best — the standing record *and* everything
 * already logged today — so working 60 → 62.5 → 65 in one session celebrates
 * each genuine new best, while a repeat or a back-off set stays quiet.
 *
 * Bodyweight lifts are judged on reps, because there is no load to beat.
 */
export function detectPR(input: {
  exercise: string;
  bodyweight: boolean;
  /** Records as they stood before today. */
  priorHeaviestKg: number | null;
  priorBestReps: number | null;
  priorBest1RM: number | null;
  /** Sets already logged today for this exercise, excluding the new one. */
  todaySets: { reps: number; weightKg: number | null }[];
  newSet: { reps: number; weightKg: number | null };
  /** True when nothing has ever been logged for this exercise before today. */
  neverLogged: boolean;
}): PRAchievement | null {
  const { exercise, bodyweight, todaySets, newSet, neverLogged } = input;

  const bestToday = (pick: (s: { reps: number; weightKg: number | null }) => number) =>
    todaySets.length ? Math.max(...todaySets.map(pick)) : 0;

  if (bodyweight || newSet.weightKg === null) {
    const running = Math.max(input.priorBestReps ?? 0, bestToday((s) => s.reps));
    if (newSet.reps > running) {
      return {
        exercise,
        kind: neverLogged && todaySets.length === 0 ? 'first' : 'reps',
        value: newSet.reps,
        previous: running > 0 ? running : null,
        unit: 'reps',
      };
    }
    return null;
  }

  const runningWeight = Math.max(
    input.priorHeaviestKg ?? 0,
    bestToday((s) => s.weightKg ?? 0),
  );
  if (newSet.weightKg > runningWeight) {
    return {
      exercise,
      kind: neverLogged && todaySets.length === 0 ? 'first' : 'weight',
      value: newSet.weightKg,
      previous: runningWeight > 0 ? runningWeight : null,
      unit: 'kg',
    };
  }

  // Not the heaviest, but possibly the strongest: more reps at a near weight
  // is real progress that a raw-weight comparison misses entirely.
  const newE1RM = estimate1RM(newSet.weightKg, newSet.reps) ?? 0;
  const runningE1RM = Math.max(
    input.priorBest1RM ?? 0,
    bestToday((s) => estimate1RM(s.weightKg, s.reps) ?? 0),
  );
  if (newE1RM > runningE1RM && runningE1RM > 0) {
    return {
      exercise,
      kind: 'e1rm',
      value: round1(newE1RM),
      previous: round1(runningE1RM),
      unit: 'kg',
    };
  }

  return null;
}
