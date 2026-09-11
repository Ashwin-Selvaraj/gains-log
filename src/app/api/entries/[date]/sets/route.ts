import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureEntryId } from '@/lib/entries';
import { isDateKey } from '@/lib/date';
import { computeRecords, detectPR, exerciseKey } from '@/lib/prs';
import { loadSets } from '@/lib/workouts';
import { emitEventInBackground } from '@/lib/events';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ date: string }> };

export async function POST(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { date } = await params;
  if (!isDateKey(date)) return NextResponse.json({ error: 'Bad date' }, { status: 400 });

  const body = (await req.json()) as Record<string, unknown>;
  const exercise = String(body.exercise ?? '').trim().slice(0, 100);
  if (!exercise) {
    return NextResponse.json({ error: 'exercise required' }, { status: 400 });
  }

  const reps = Math.round(Number(body.reps));
  if (!Number.isFinite(reps) || reps < 1 || reps > 1000) {
    return NextResponse.json({ error: 'reps must be 1-1000' }, { status: 400 });
  }

  let weightKg: number | null = null;
  if (body.weightKg !== null && body.weightKg !== '' && body.weightKg !== undefined) {
    const w = Number(body.weightKg);
    if (!Number.isFinite(w) || w < 0 || w > 1000) {
      return NextResponse.json({ error: 'weightKg must be 0-1000' }, { status: 400 });
    }
    weightKg = w;
  }

  const entryId = await ensureEntryId(user.id, date);

  // Logging a set means you trained. Ticking the stamp separately is busywork.
  const [set] = await Promise.all([
    prisma.workoutSet.create({
      data: {
        exercise,
        exerciseKey: exerciseKey(exercise),
        reps,
        weightKg,
        userId: user.id,
        entryId,
      },
    }),
    prisma.dailyEntry.update({ where: { id: entryId }, data: { workoutDone: true } }),
  ]);

  void announcePR(user.id, date, set.id, exerciseKey(exercise), exercise, reps, weightKg);

  return NextResponse.json(set, { status: 201 });
}

/**
 * Says so when a set just became a personal best.
 *
 * Detected again on the server rather than trusting the client's own
 * celebration, because the two answer different questions: the page can only
 * speak to the device it is running on, and the point of a push is the device
 * that is not. The service worker then decides which — an open, focused page
 * gets the event handed to it rather than a system notification, so the phone
 * you are holding does not say the same thing twice.
 *
 * Deliberately not awaited by the caller: logging a set happens between reps,
 * and the response must not wait on a push service round trip. A failure here
 * costs a notification, never the set.
 */
async function announcePR(
  userId: string,
  date: string,
  newSetId: string,
  key: string,
  exercise: string,
  reps: number,
  weightKg: number | null,
): Promise<void> {
  try {
    const all = await loadSets(userId, { keys: [key] });
    const prior = all.filter((s) => s.date < date);
    const records = computeRecords(prior, date);

    const achievement = detectPR({
      exercise,
      bodyweight: records?.bodyweight ?? weightKg === null,
      priorHeaviestKg: records?.heaviest?.weightKg ?? null,
      priorBestReps: records?.bestReps?.reps ?? null,
      priorBest1RM: records?.best1RM?.est1RM ?? null,
      // Today's other sets, so a second-best set later in the session is not
      // announced as a record just because it beats last week.
      todaySets: all
        .filter((s) => s.date === date && s.id !== newSetId)
        .map((s) => ({ reps: s.reps, weightKg: s.weightKg })),
      newSet: { reps, weightKg },
      neverLogged: prior.length === 0,
    });

    // A first-ever log is a milestone in the page, not something to push: you
    // cannot be surprised by having just done a lift for the first time.
    if (!achievement || achievement.kind === 'first') return;

    const value = `${achievement.value}${achievement.unit === 'kg' ? ' kg' : ' reps'}`;
    emitEventInBackground(userId, {
      kind: 'pr',
      subject: key,
      date,
      title: `New best — ${exercise}`,
      body:
        achievement.previous === null
          ? `${value}.`
          : `${value}, up from ${achievement.previous}${achievement.unit === 'kg' ? ' kg' : ''}.`,
      url: `/exercise/${encodeURIComponent(key)}`,
    });
  } catch (err) {
    console.error('[sets] PR announcement failed', err);
  }
}
