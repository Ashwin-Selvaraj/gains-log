import { addDays, daysBetween, type DateKey } from '@/lib/date';

/**
 * Profile statistics. Pure — no Prisma, no React — so the numbers can be
 * checked against fixtures and reused by the profile screen, the report and
 * anything added later without dragging a database along.
 */

/** The shape the profile needs from a day. Deliberately narrower than the row. */
export type DayLike = {
  date: DateKey;
  workoutDone: boolean;
  learningDone: boolean;
  sleptWell: boolean;
  waterDone: boolean;
  waterLitres: number | null;
  weightKg: number | null;
  sleepHours: number | null;
  mealCount: number;
  setCount: number;
};

/**
 * A day counts towards a streak if anything was actually recorded on it.
 *
 * Opening the app is not logging. The Today screen creates no row until you
 * touch something, so the mere existence of a row is already meaningful — but
 * a row can also be left behind by a value that was typed and then cleared,
 * which is why this checks the contents rather than trusting the row.
 */
export function isLogged(day: DayLike): boolean {
  return (
    day.workoutDone ||
    day.learningDone ||
    day.sleptWell ||
    day.waterDone ||
    day.weightKg != null ||
    day.sleepHours != null ||
    day.waterLitres != null ||
    day.mealCount > 0 ||
    day.setCount > 0
  );
}

/** Streak milestone the app celebrates, as requested. */
export const STREAK_TARGET = 5;

export type Streaks = {
  /** Consecutive logged days ending today (or yesterday — see below). */
  current: number;
  /** Best run ever. */
  longest: number;
  /**
   * True when today itself is not yet logged but yesterday was, so the current
   * streak is alive but at risk. The distinction matters at 9pm: "3 days, log
   * today to keep it" is useful, "3 days" alone is not.
   */
  atRisk: boolean;
};

export function computeStreaks(days: DayLike[], today: DateKey): Streaks {
  const logged = new Set(days.filter(isLogged).map((d) => d.date));

  // Counting back from today would report zero all morning, before anything
  // has been logged — so if today is blank, count back from yesterday and flag
  // the streak as at risk rather than pretending it has already broken.
  const todayLogged = logged.has(today);
  const anchor = todayLogged ? today : addDays(today, -1);
  const atRisk = !todayLogged && logged.has(anchor);

  let current = 0;
  for (let cursor = anchor; logged.has(cursor); cursor = addDays(cursor, -1)) {
    current++;
  }

  let longest = 0;
  let run = 0;
  let previous: DateKey | null = null;
  for (const date of [...logged].sort()) {
    run = previous && daysBetween(previous, date) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  return { current, longest, atRisk };
}

/* ── Body ─────────────────────────────────────────────────────────────── */

export type BmiBand = 'under' | 'healthy' | 'over' | 'obese';

export type BodyStats = {
  currentKg: number | null;
  /** The weight the goal is measured from. */
  startKg: number;
  goalKg: number;
  /** Kilograms gained since the start. Negative means lost. */
  changeKg: number | null;
  /** Kilograms still to go. Zero once the goal is reached. */
  toGoalKg: number | null;
  /** 0–1 along the start → goal path, clamped. */
  progress: number;
  heightCm: number | null;
  bmi: number | null;
  band: BmiBand | null;
  /** The healthy weight range for this height, for context beside the number. */
  healthyRangeKg: [number, number] | null;
};

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/**
 * WHO cut-offs. Worth saying plainly on the screen that BMI ignores body
 * composition: someone deliberately putting on muscle can read "overweight"
 * while doing exactly what they set out to do.
 */
export function bmiBand(value: number): BmiBand {
  if (value < 18.5) return 'under';
  if (value < 25) return 'healthy';
  if (value < 30) return 'over';
  return 'obese';
}

export function buildBodyStats(opts: {
  currentKg: number | null;
  startKg: number;
  goalKg: number;
  heightCm: number | null;
}): BodyStats {
  const { currentKg, startKg, goalKg, heightCm } = opts;

  const span = goalKg - startKg;
  const done = currentKg == null ? 0 : currentKg - startKg;
  const progress = span === 0 ? 1 : Math.min(1, Math.max(0, done / span));

  const value = currentKg != null && heightCm ? bmi(currentKg, heightCm) : null;
  const m = heightCm ? heightCm / 100 : null;

  return {
    currentKg,
    startKg,
    goalKg,
    changeKg: currentKg == null ? null : currentKg - startKg,
    toGoalKg: currentKg == null ? null : Math.max(0, goalKg - currentKg),
    progress,
    heightCm,
    bmi: value,
    band: value == null ? null : bmiBand(value),
    healthyRangeKg: m ? [18.5 * m * m, 24.9 * m * m] : null,
  };
}

/* ── Consistency ──────────────────────────────────────────────────────── */

export type HabitTally = {
  workouts: number;
  learning: number;
  water: number;
  sleptWell: number;
  /** Days with any entry at all, the denominator for the rates above. */
  daysLogged: number;
  totalDays: number;
  avgSleepHours: number | null;
  avgWaterLitres: number | null;
};

export function tallyHabits(days: DayLike[]): HabitTally {
  const logged = days.filter(isLogged);
  const mean = (values: number[]) =>
    values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

  return {
    workouts: days.filter((d) => d.workoutDone).length,
    learning: days.filter((d) => d.learningDone).length,
    water: days.filter((d) => d.waterDone || (d.waterLitres ?? 0) > 0).length,
    sleptWell: days.filter((d) => d.sleptWell).length,
    daysLogged: logged.length,
    totalDays: days.length,
    avgSleepHours: mean(days.map((d) => d.sleepHours).filter((v): v is number => v != null)),
    avgWaterLitres: mean(days.map((d) => d.waterLitres).filter((v): v is number => v != null)),
  };
}
