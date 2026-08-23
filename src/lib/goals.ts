/**
 * Targets now live in the database (see src/lib/settings.ts) so they can be
 * edited on the Goals screen. Defaults are declared once, in the Prisma schema.
 */

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const HABITS = [
  { key: 'workoutDone', label: 'Workout', icon: '🏋️' },
  { key: 'walkDone', label: 'Walk', icon: '🚶' },
  { key: 'learningDone', label: 'Learning', icon: '📘' },
  { key: 'sleptWell', label: 'Slept well', icon: '😴' },
] as const;

export type HabitKey = (typeof HABITS)[number]['key'];

export const MEAL_SOURCES = ['manual', 'preset', 'photo-estimate'] as const;
export type MealSource = (typeof MEAL_SOURCES)[number];
