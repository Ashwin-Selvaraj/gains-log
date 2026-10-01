import { METRICS, type MetricKey } from '@/lib/chain/metrics';

/**
 * How each pledge metric is presented. The on-chain/verifier definitions live
 * in metrics.ts; this is only the voice and icon the screen uses for them.
 *
 * `perDayCap` marks metrics that can grow by at most one per day (a session,
 * a protein day), which is what lets the screen say "out of reach" early.
 */
export const KINDS: Record<
  MetricKey,
  { icon: string; title: string; pitch: string; perDayCap: boolean }
> = {
  sessions: {
    icon: '🗓️',
    title: 'Show up',
    pitch: 'Train on a set number of days.',
    perDayCap: true,
  },
  protein_days: {
    icon: '🥩',
    title: 'Hit protein',
    pitch: 'Reach your protein target on enough days.',
    perDayCap: true,
  },
  volume: {
    icon: '🏋️',
    title: 'Move weight',
    pitch: 'Lift a total volume on one exercise.',
    perDayCap: false,
  },
};

export function kindOf(metric: string) {
  const def = METRICS.find((m) => m.key === metric);
  const kind = KINDS[metric as MetricKey];
  return {
    icon: kind?.icon ?? '🎯',
    title: kind?.title ?? def?.label ?? metric,
    pitch: kind?.pitch ?? def?.hint ?? '',
    perDayCap: kind?.perDayCap ?? false,
    unit: def?.unit ?? '',
    needsExercise: def?.needsExercise ?? false,
  };
}

export const ORDER: MetricKey[] = ['sessions', 'protein_days', 'volume'];
