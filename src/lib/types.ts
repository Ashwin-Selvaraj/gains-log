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
  carbs?: number | null;
  fat?: number | null;
  fiber?: number | null;
  foodId?: string | null;
  grams?: number | null;
  source: MealSource;
  /** Absent in the History list — see the comment in api/history/route.ts. */
  photoUrl?: string | null;
};

export type Photo = {
  id: string;
  kind: 'progress' | 'meal' | 'other';
  key: string;
  url: string;
  caption: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  mealId: string | null;
  createdAt: string;
};

export type Macros = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export type Food = {
  id: string;
  name: string;
  nameKey: string;
  aliases: string;
  category: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  servingLabel: string;
  servingGrams: number;
};

export type PresetItem = {
  id: string;
  foodId: string;
  name: string;
  grams: number;
  servingLabel: string;
  servingGrams: number;
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

export type CarriedExercise = {
  id: string;
  name: string;
  key: string;
  sets: number;
  reps: string;
  fromDate: string;
};

export type PlanProgress = {
  sessionName: string | null;
  restDay: boolean;
  exercises: {
    name: string;
    exerciseKey: string;
    targetSets: number;
    reps: string;
    doneSets: number;
    complete: boolean;
  }[];
  doneCount: number;
  totalCount: number;
  complete: boolean;
  partial: boolean;
  missed: { name: string; exerciseKey: string; sets: number; reps: string }[];
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
  learningDone: boolean;
  sleptWell: boolean;
  waterDone: boolean;
  waterLitres: number | null;
  weightKg: number | null;
  sleepHours: number | null;
  workoutNote: string;
  learningNote: string;
  meetings: Meeting[];
  meals: Meal[];
  sets: WorkoutSet[];
  photos: Photo[];
};

export type Preset = {
  id: string;
  name: string;
  macros: Macros;
  items: PresetItem[];
  /** True when the preset predates the food database and has no foods behind it. */
  legacy: boolean;
};

export type EstimatedItem = {
  name: string;
  foodId: string | null;
  matchedName: string | null;
  grams: number;
  portionLabel: string;
  macros: Macros;
  recognised: boolean;
};

export type PhotoEstimate = {
  mealName: string;
  items: EstimatedItem[];
  totals: Macros;
  unclear: boolean;
  caveat: string;
  unrecognised: string[];
};

