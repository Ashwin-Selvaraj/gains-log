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
  photoUrl: string | null;
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
