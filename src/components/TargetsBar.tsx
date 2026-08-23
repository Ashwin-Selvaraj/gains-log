'use client';

import { GOALS } from '@/lib/goals';

function Meter({
  label,
  value,
  suffix,
  hit,
  fraction,
  target,
}: {
  label: string;
  value: number;
  suffix: string;
  hit: boolean;
  fraction: number;
  target: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-medium">
          {label}{' '}
          <span className="tabular-nums text-muted">
            {value}
            {suffix}
          </span>
        </span>
        <span className={`text-xs tabular-nums ${hit ? 'text-accent' : 'text-muted'}`}>
          {hit ? '✓ ' : ''}
          {target}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            hit ? 'bg-accent' : 'bg-muted/60'
          }`}
          style={{ width: `${Math.min(100, fraction * 100)}%` }}
        />
      </div>
    </div>
  );
}

/** "Am I on track today?" answered without making the user do arithmetic. */
export function TargetsBar({ calories, protein }: { calories: number; protein: number }) {
  const { proteinGramsPerDay, caloriesPerDayMin, caloriesPerDayMax } = GOALS;

  return (
    <section className="card space-y-3" aria-label="Today's targets">
      <Meter
        label="Protein"
        value={protein}
        suffix="g"
        hit={protein >= proteinGramsPerDay}
        fraction={protein / proteinGramsPerDay}
        target={`${proteinGramsPerDay}g`}
      />
      <Meter
        label="Calories"
        value={calories}
        suffix=" kcal"
        hit={calories >= caloriesPerDayMin && calories <= caloriesPerDayMax}
        fraction={calories / caloriesPerDayMax}
        target={`${caloriesPerDayMin.toLocaleString()}–${caloriesPerDayMax.toLocaleString()}`}
      />
    </section>
  );
}
