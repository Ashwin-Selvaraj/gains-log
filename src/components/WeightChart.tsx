'use client';

import { LineChart } from '@/components/LineChart';

type Point = { date: string; weightKg: number | null };

/** Bodyweight over the trend window. Drawing is delegated to LineChart. */
export function WeightChart({ data }: { data: Point[] }) {
  return (
    <LineChart
      data={data.map((d) => ({ date: d.date, value: d.weightKg }))}
      label="Weight trend"
      unit=" kg"
      emptyMessage="Log your weight on at least two days to see a trend."
    />
  );
}
