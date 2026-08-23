import { NextResponse } from 'next/server';
import { loadSets } from '@/lib/workouts';
import {
  computeRecords,
  markPRs,
  oneRepMaxSeries,
  repsSeries,
  toSessions,
} from '@/lib/prs';
import { isDateKey, todayKey } from '@/lib/date';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ key: string }> };

/** The full detail report for one exercise. */
export async function GET(req: Request, { params }: Params) {
  const { key } = await params;
  const decoded = decodeURIComponent(key);

  const param = new URL(req.url).searchParams.get('today');
  const today = param && isDateKey(param) ? param : todayKey();

  const sets = await loadSets({ keys: [decoded] });
  const records = computeRecords(sets, today);

  if (!records) {
    return NextResponse.json({ error: 'No sets logged for this exercise' }, { status: 404 });
  }

  const prs = markPRs(sets);

  return NextResponse.json({
    records,
    // Bodyweight lifts have no load to extrapolate a 1RM from, so their
    // progress line is reps instead.
    series: records.bodyweight ? repsSeries(sets) : oneRepMaxSeries(sets),
    seriesLabel: records.bodyweight ? 'Best set (reps)' : 'Estimated 1RM (kg)',
    sessions: toSessions(sets).map((s) => ({
      date: s.date,
      volumeKg: s.volumeKg,
      sets: s.sets.map((set) => ({
        id: set.id,
        reps: set.reps,
        weightKg: set.weightKg,
        prs: prs.get(set.id) ?? [],
      })),
    })),
  });
}
