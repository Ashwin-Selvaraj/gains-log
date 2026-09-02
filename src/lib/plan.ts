/**
 * "Did I do what I planned?" — pure, no Prisma, no React.
 *
 * One definition of completion, shared by the Today card, the carry-forward
 * flow and the weekly report. Two places computing "complete" slightly
 * differently is how a report ends up disagreeing with the screen it summarises.
 */

export type PlannedExercise = {
  name: string;
  exerciseKey: string;
  sets: number;
  reps: string;
};

export type LoggedSet = { exercise: string; reps: number; weightKg: number | null };

export type ExerciseProgress = {
  name: string;
  exerciseKey: string;
  targetSets: number;
  reps: string;
  doneSets: number;
  complete: boolean;
};

export type PlanProgress = {
  /** Null when the day has no session planned. */
  sessionName: string | null;
  restDay: boolean;
  exercises: ExerciseProgress[];
  doneCount: number;
  totalCount: number;
  /** Every planned exercise hit its target set count. */
  complete: boolean;
  /** Something was done, but not everything. */
  partial: boolean;
  /** Planned exercises with fewer sets than targeted. */
  missed: PlannedExercise[];
};

const keyOf = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

export function isRestDay(sessionName: string | null | undefined): boolean {
  return !sessionName || sessionName.trim().toLowerCase() === 'rest';
}

/**
 * Completion is counted per exercise against its target set count, not as a
 * single yes/no for the session: three of four exercises done is real progress
 * and should read as such, and only the fourth is worth carrying forward.
 */
export function planProgress(
  sessionName: string | null,
  planned: PlannedExercise[],
  logged: LoggedSet[],
): PlanProgress {
  const setsByKey = new Map<string, number>();
  for (const s of logged) {
    const k = keyOf(s.exercise);
    setsByKey.set(k, (setsByKey.get(k) ?? 0) + 1);
  }

  const exercises: ExerciseProgress[] = planned.map((p) => {
    const key = p.exerciseKey || keyOf(p.name);
    const doneSets = setsByKey.get(key) ?? 0;
    return {
      name: p.name,
      exerciseKey: key,
      targetSets: p.sets,
      reps: p.reps,
      doneSets,
      complete: doneSets >= p.sets,
    };
  });

  const doneCount = exercises.filter((e) => e.complete).length;
  const rest = isRestDay(sessionName);

  return {
    sessionName: sessionName ?? null,
    restDay: rest,
    exercises,
    doneCount,
    totalCount: exercises.length,
    // A rest day with nothing planned is trivially "complete" — there was
    // nothing to miss, and flagging it incomplete would be nagging about rest.
    complete: exercises.length === 0 ? rest : doneCount === exercises.length,
    partial: doneCount > 0 && doneCount < exercises.length,
    missed: exercises
      .filter((e) => !e.complete)
      .map((e) => ({
        name: e.name,
        exerciseKey: e.exerciseKey,
        sets: e.targetSets,
        reps: e.reps,
      })),
  };
}
