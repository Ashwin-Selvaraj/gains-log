import { NextResponse } from 'next/server';
import { loadSets } from '@/lib/workouts';
import { recordsByExercise } from '@/lib/prs';
import { isDateKey, todayKey } from '@/lib/date';

export const dynamic = 'force-dynamic';

/** Directory of every exercise ever logged, most recently trained first. */
export async function GET(req: Request) {
  const param = new URL(req.url).searchParams.get('today');
  const today = param && isDateKey(param) ? param : todayKey();

  const records = [...recordsByExercise(await loadSets(), today).values()];

  return NextResponse.json(
    records
      .map((r) => ({
        key: r.key,
        name: r.name,
        bodyweight: r.bodyweight,
        heaviestKg: r.heaviest?.weightKg ?? null,
        bestReps: r.bestReps?.reps ?? null,
        best1RM: r.best1RM?.est1RM ?? null,
        lastDate: r.lastDate,
        daysSinceLast: r.daysSinceLast,
        weeksTrained: r.weeksTrained,
        weekStreak: r.weekStreak,
        totals: r.totals,
      }))
      .sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? '')),
  );
}
