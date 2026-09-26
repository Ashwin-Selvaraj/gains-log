/**
 * What a staked goal can measure — the definitions, with no I/O.
 *
 * Split from evaluate.ts for the same reason event-kinds.ts is split from
 * events.ts, and caught the same way: the staking UI needs this list, and
 * importing it from the evaluator pulled Prisma and `server-only` into the
 * client bundle, failing the build. A description of a metric has no business
 * knowing how to query for it.
 */

export const METRICS = [
  {
    key: 'volume',
    label: 'Total volume',
    unit: 'kg',
    hint: 'Sum of reps × weight for one lift, over the whole window.',
    needsExercise: true,
  },
  {
    key: 'sessions',
    label: 'Training sessions',
    unit: 'sessions',
    hint: 'Days with at least one set logged.',
    needsExercise: false,
  },
  {
    key: 'protein_days',
    label: 'Days hitting protein',
    unit: 'days',
    hint: 'Days where logged protein reached your target.',
    needsExercise: false,
  },
] as const;

export type MetricKey = (typeof METRICS)[number]['key'];
export const METRIC_KEYS = METRICS.map((m) => m.key) as readonly string[];
