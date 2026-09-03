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

/**
 * The four daily habits. Still four for scoring purposes — the report, the
 * history strip and the streak all count them the same way.
 */
export const HABITS = [
  { key: 'workoutDone', label: 'Workout', icon: '🏋️' },
  { key: 'waterDone', label: 'Water', icon: '💧' },
  { key: 'learningDone', label: 'Learning', icon: '📘' },
  { key: 'sleptWell', label: 'Slept well', icon: '😴' },
] as const;

/**
 * The two that are genuinely yes/no, and so get a stamp on Today.
 *
 * Water and sleep were stamps too, which made them meaningless: "drank water"
 * is true of every living day. Both are quantities, so they moved to sliders
 * lower down the screen (see MeasureSlider) — water's tick is now derived from
 * the litres, and sleep keeps a separate "slept well" toggle because how
 * rested you feel is not the same fact as how long you were in bed.
 */
export const STAMP_HABITS = HABITS.filter(
  (h) => h.key === 'workoutDone' || h.key === 'learningDone',
);

export type HabitKey = (typeof HABITS)[number]['key'];

/** Sensible ceilings and defaults for the measured habits. */
export const MEASURES = {
  water: { max: 6, step: 0.25, target: 3, unit: 'L', icon: '💧', label: 'Water' },
  sleep: { max: 12, step: 0.25, target: 7.5, unit: 'hrs', icon: '😴', label: 'Sleep' },
} as const;

export const MEAL_SOURCES = ['manual', 'preset', 'photo-estimate', 'food'] as const;
export type MealSource = (typeof MEAL_SOURCES)[number];

/**
 * The meals of a day, in the order they happen.
 *
 * Every meal used to land in one undifferentiated list, so a day's log said
 * what you ate but not when — and "am I front-loading my protein or eating it
 * all at dinner?" is one of the few genuinely useful questions a food log can
 * answer. The default hours are how a new entry guesses its slot from the
 * clock, so the common case needs no choice at all.
 */
export const MEAL_SLOTS = [
  { key: 'breakfast', label: 'Breakfast', icon: '🌅', untilHour: 11 },
  { key: 'lunch', label: 'Lunch', icon: '☀️', untilHour: 16 },
  { key: 'snack', label: 'Snack', icon: '🍎', untilHour: 19 },
  { key: 'dinner', label: 'Dinner', icon: '🌙', untilHour: 24 },
] as const;

export type MealSlot = (typeof MEAL_SLOTS)[number]['key'];

export const MEAL_SLOT_KEYS = MEAL_SLOTS.map((s) => s.key) as readonly MealSlot[];

/** The slot a meal logged right now most likely belongs to. */
export function slotForHour(hour: number): MealSlot {
  return (MEAL_SLOTS.find((s) => hour < s.untilHour) ?? MEAL_SLOTS[3]).key;
}
