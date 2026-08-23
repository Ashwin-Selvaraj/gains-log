'use client';

import { useEffect, useState } from 'react';
import { mutate } from '@/lib/sync';
import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';
import type { Settings } from '@/lib/types';

const FIELDS = [
  { key: 'startWeightKg', label: 'Starting weight', unit: 'kg', step: '0.1' },
  { key: 'goalWeightKg', label: 'Goal weight', unit: 'kg', step: '0.1' },
  { key: 'proteinTarget', label: 'Protein target', unit: 'g / day', step: '5' },
  { key: 'caloriesMin', label: 'Calorie floor', unit: 'kcal / day', step: '50' },
  { key: 'caloriesMax', label: 'Calorie ceiling', unit: 'kcal / day', step: '50' },
  { key: 'weeklyWorkoutGoal', label: 'Training sessions', unit: 'per week', step: '1' },
] as const;

export default function GoalsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | string>('idle');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json() as Promise<Settings>)
      .then((s) => {
        setSettings(s);
        setValues(
          Object.fromEntries(FIELDS.map((f) => [f.key, String(s[f.key])])),
        );
      })
      .catch(() => setStatus('Could not load your goals.'));
  }, []);

  async function save() {
    setStatus('saving');
    try {
      const payload = Object.fromEntries(
        FIELDS.map((f) => [f.key, Number(values[f.key])]),
      );
      const saved = await mutate<Settings>('/api/settings', 'PATCH', payload);
      setSettings(saved);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not save');
    }
  }

  if (!settings) {
    return (
      <PageSkeleton title="Goals" subtitle="What the report measures against">
        <SkeletonBlock className="h-72" />
      </PageSkeleton>
    );
  }

  const toGain = Number(values.goalWeightKg) - Number(values.startWeightKg);

  return (
    <>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Goals</h1>
        <p className="text-sm text-muted">
          Every number the Report and Today screens measure against.
        </p>
      </header>

      <section className="card space-y-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="label" htmlFor={f.key}>
              {f.label} <span className="font-normal">({f.unit})</span>
            </label>
            <input
              id={f.key}
              className="field"
              type="number"
              inputMode="decimal"
              step={f.step}
              min="0"
              value={values[f.key] ?? ''}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
            />
          </div>
        ))}

        <button type="button" className="btn-primary w-full" onClick={save}>
          {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save goals'}
        </button>

        {typeof status === 'string' && !['idle', 'saving', 'saved'].includes(status) && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {status}
          </p>
        )}
      </section>

      {Number.isFinite(toGain) && toGain > 0 && (
        <p className="mt-3 text-center text-sm text-muted">
          That&apos;s <strong className="text-ink">{toGain.toFixed(1)} kg</strong> to gain
          overall. At a realistic ~0.25 kg/week for lean gaining, roughly{' '}
          {Math.ceil(toGain / 0.25)} weeks.
        </p>
      )}

      <a href="/api/export" className="btn-quiet mt-4 w-full" download>
        ⬇ Export everything as CSV
      </a>
    </>
  );
}
