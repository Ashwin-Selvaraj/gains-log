'use client';

import { useEffect, useState } from 'react';
import type { PRAchievement } from '@/lib/prs';

type Props = {
  achievement: PRAchievement | null;
  onDismiss: () => void;
};

const COPY: Record<PRAchievement['kind'], { title: string; sub: string }> = {
  weight: { title: 'New PR', sub: 'Heaviest ever' },
  e1rm: { title: 'New PR', sub: 'Strongest set yet' },
  reps: { title: 'New PR', sub: 'Most reps ever' },
  first: { title: 'First time', sub: 'Baseline set — everything from here beats it' },
};

/** Auto-dismisses; you're mid-set, not reading a dialog. */
const VISIBLE_MS = 3200;

/**
 * Shown the moment a logged set beats a record.
 *
 * Deliberately a banner over the top of the screen rather than a modal: a modal
 * would block the reps field, and the next thing you want to do after hitting a
 * PR is log the next set. It gets out of the way on its own.
 */
export function PRCelebration({ achievement, onDismiss }: Props) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!achievement) return;
    setLeaving(false);

    // Haptic where it exists — on a phone this lands better than the animation.
    navigator.vibrate?.([18, 60, 36]);

    const out = setTimeout(() => setLeaving(true), VISIBLE_MS);
    const gone = setTimeout(onDismiss, VISIBLE_MS + 280);
    return () => {
      clearTimeout(out);
      clearTimeout(gone);
    };
  }, [achievement, onDismiss]);

  if (!achievement) return null;

  const { title, sub } = COPY[achievement.kind];
  const delta =
    achievement.previous !== null
      ? Math.round((achievement.value - achievement.previous) * 10) / 10
      : null;

  return (
    <div
      className={`fixed inset-x-0 top-0 z-[60] px-3 pt-3 ${leaving ? 'pr-leaving' : 'pr-entering'}`}
      role="status"
      aria-live="polite"
      onClick={onDismiss}
    >
      <div className="relative mx-auto max-w-2xl overflow-hidden rounded-2xl border border-accent bg-card p-4 shadow-lg">
        {/* A single sweep of light across the card — enough to feel like a
            moment, brief enough not to be in the way of the next set. */}
        <span aria-hidden className="pr-sheen pointer-events-none absolute inset-0" />

        <div className="relative flex items-center gap-3">
          <span aria-hidden className="pr-medal text-3xl leading-none">
            {achievement.kind === 'first' ? '🌱' : '🏆'}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold uppercase tracking-wide text-accent">{title}</p>
            <p className="truncate text-base font-semibold">
              {achievement.exercise}{' '}
              <span className="tabular-nums">
                {achievement.value}
                {achievement.unit === 'kg' ? ' kg' : ' reps'}
              </span>
            </p>
            <p className="text-xs text-muted">
              {sub}
              {achievement.previous !== null && delta !== null && (
                <>
                  {' '}· beat {achievement.previous}
                  {achievement.unit === 'kg' ? ' kg' : ''} by{' '}
                  <strong className="text-accent">
                    +{delta}
                    {achievement.unit === 'kg' ? ' kg' : ''}
                  </strong>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
