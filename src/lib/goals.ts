/** The targets this tracker measures against. Edit here, not in the UI. */
export const GOALS = {
  startWeightKg: 68,
  goalWeightKg: 85,
  proteinGramsPerDay: 140,
  caloriesPerDayMin: 2800,
  caloriesPerDayMax: 3100,
} as const;

export const HABITS = [
  { key: 'workoutDone', label: 'Workout', icon: '🏋️' },
  { key: 'walkDone', label: 'Walk', icon: '🚶' },
  { key: 'learningDone', label: 'Learning', icon: '📘' },
  { key: 'sleptWell', label: 'Slept well', icon: '😴' },
] as const;

export type HabitKey = (typeof HABITS)[number]['key'];

export const MEAL_SOURCES = ['manual', 'preset', 'photo-estimate'] as const;
export type MealSource = (typeof MEAL_SOURCES)[number];
