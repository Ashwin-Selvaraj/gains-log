import type { MealSource } from '@/lib/goals';

/** Wire shapes — what the API routes actually return (dates serialised to strings). */

export type Meeting = {
  id: string;
  time: string;
  title: string;
};

export type Meal = {
  id: string;
  name: string;
  calories: number | null;
  protein: number | null;
  source: MealSource;
  /** Absent in the History list — see the comment in api/history/route.ts. */
  photoUrl?: string | null;
};

export type WorkoutSet = {
  id: string;
  exercise: string;
  reps: number;
  weightKg: number | null;
};

export type ExerciseContext = {
  key: string;
  name: string;
  last: { date: string; volumeKg: number; sets: { reps: number; weightKg: number | null }[] } | null;
  daysSince: number | null;
  heaviestKg: number | null;
  bestReps: number | null;
  best1RM: number | null;
  bodyweight: boolean;
  weeksTrained: number;
};

export type PlanExercise = {
  id: string;
  name: string;
  sets: number;
  reps: string;
};

export type PlanDay = {
  id: string;
  weekday: number;
  name: string;
  exercises: PlanExercise[];
};

export type Settings = {
  id: string;
  startWeightKg: number;
  goalWeightKg: number;
  proteinTarget: number;
  caloriesMin: number;
  caloriesMax: number;
  weeklyWorkoutGoal: number;
};

export type Entry = {
  id: string;
  date: string;
  workoutDone: boolean;
  walkDone: boolean;
  learningDone: boolean;
  sleptWell: boolean;
  weightKg: number | null;
  sleepHours: number | null;
  walkMinutes: number | null;
  workoutNote: string;
  learningNote: string;
  meetings: Meeting[];
  meals: Meal[];
  sets: WorkoutSet[];
};

export type Preset = {
  id: string;
  name: string;
  calories: number | null;
  protein: number | null;
};

export type PhotoEstimate = {
  items: string[];
  name: string;
  calories: number;
  protein: number;
  unclear: boolean;
  caveat: string;
};
