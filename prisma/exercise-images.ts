/**
 * Which picture belongs to which exercise.
 *
 * Source is yuhonas/free-exercise-db — 873 illustrated movements, Unlicense
 * (public domain) on the dataset. One caveat worth recording: the photographs'
 * own chain of title is not documented upstream, and the question has sat
 * unanswered in that repo's issue #2. Fine for a personal log; worth revisiting
 * before this app is ever sold or ad-supported. Swapping source later costs one
 * re-run of scripts/import-exercise-images.ts, because nothing but Exercise
 * .imageUrl depends on where the bytes came from.
 *
 * The mapping is written by hand rather than fuzzy-matched, and that is the
 * whole point of this file. Automatic name matching scored 69 of 80 "matched"
 * and was confidently wrong on the ones that mattered: "Seated cable row" chose
 * *Cable Seated Crunch* (an ab exercise), "Barbell row" chose *Upright Barbell
 * Row* (a shoulder exercise), "Pull-up" chose *Scapular Pull-Up*. A picture of
 * the wrong movement is worse than no picture — it teaches the wrong thing to
 * the one person who most needs it, someone who doesn't yet recognise the lift.
 *
 * Left deliberately absent: "Bulgarian split squat", which the dataset has no
 * true entry for. A plain split squat is a different movement (both feet on the
 * floor), so it falls back to its muscle-group icon instead.
 *
 * Keys are Exercise.name from ./exercises.ts; values are the exact `name` field
 * in the upstream dataset. Both are validated by the import script before a
 * single byte is fetched.
 */
export const EXERCISE_IMAGE_SOURCES: Record<string, string> = {
  // ── Chest ───────────────────────────────────────────────────────────────
  "Bench press": "Barbell Bench Press - Medium Grip",
  "Incline bench press": "Barbell Incline Bench Press - Medium Grip",
  "Decline bench press": "Decline Barbell Bench Press",
  "Dumbbell bench press": "Dumbbell Bench Press",
  "Incline dumbbell press": "Incline Dumbbell Press",
  "Chest fly": "Dumbbell Flyes",
  "Cable crossover": "Cable Crossover",
  "Pec deck": "Butterfly",
  "Machine chest press": "Leverage Chest Press",
  "Push-up": "Pushups",
  "Dips": "Dips - Chest Version",

  // ── Back ────────────────────────────────────────────────────────────────
  "Deadlift": "Barbell Deadlift",
  "Romanian deadlift": "Romanian Deadlift",
  "Barbell row": "Bent Over Barbell Row",
  "Dumbbell row": "One-Arm Dumbbell Row",
  "Pull-up": "Pullups",
  "Chin-up": "Chin-Up",
  "Lat pulldown": "Wide-Grip Lat Pulldown",
  "Seated cable row": "Seated Cable Rows",
  "T-bar row": "T-Bar Row with Handle",
  "Machine row": "Leverage High Row",
  "Straight-arm pulldown": "Straight-Arm Pulldown",
  "Face pull": "Face Pull",
  "Shrug": "Barbell Shrug",
  "Back extension": "Hyperextensions (Back Extensions)",

  // ── Shoulders ───────────────────────────────────────────────────────────
  "Overhead press": "Standing Military Press",
  "Dumbbell shoulder press": "Dumbbell Shoulder Press",
  "Arnold press": "Arnold Dumbbell Press",
  "Lateral raise": "Side Lateral Raise",
  "Front raise": "Front Dumbbell Raise",
  "Rear delt fly": "Seated Bent-Over Rear Delt Raise",
  "Upright row": "Upright Barbell Row",
  "Machine shoulder press": "Machine Shoulder (Military) Press",

  // ── Arms ────────────────────────────────────────────────────────────────
  "Barbell curl": "Barbell Curl",
  "Dumbbell curl": "Dumbbell Bicep Curl",
  "Hammer curl": "Hammer Curls",
  "Preacher curl": "Preacher Curl",
  "Cable curl": "Standing Biceps Cable Curl",
  "Concentration curl": "Concentration Curls",
  "Triceps pushdown": "Triceps Pushdown",
  "Overhead triceps extension": "Standing Overhead Barbell Triceps Extension",
  "Skull crusher": "EZ-Bar Skullcrusher",
  "Close-grip bench press": "Close-Grip Barbell Bench Press",
  "Triceps dip": "Dips - Triceps Version",
  "Wrist curl": "Palms-Up Barbell Wrist Curl Over A Bench",

  // ── Legs ────────────────────────────────────────────────────────────────
  "Back squat": "Barbell Squat",
  "Front squat": "Front Barbell Squat",
  "Goblet squat": "Goblet Squat",
  "Leg press": "Leg Press",
  "Hack squat": "Hack Squat",
  "Lunge": "Barbell Lunge",
  "Step-up": "Dumbbell Step Ups",
  "Leg extension": "Leg Extensions",
  "Leg curl": "Seated Leg Curl",
  "Calf raise": "Standing Barbell Calf Raise",
  "Sissy squat": "Weighted Sissy Squat",

  // ── Glutes ──────────────────────────────────────────────────────────────
  "Hip thrust": "Barbell Hip Thrust",
  "Glute bridge": "Barbell Glute Bridge",
  "Cable kickback": "One-Legged Cable Kickback",
  "Hip abduction": "Thigh Abductor",
  "Sumo deadlift": "Sumo Deadlift",
  "Good morning": "Good Morning",

  // ── Core ────────────────────────────────────────────────────────────────
  "Plank": "Plank",
  "Side plank": "Side Bridge",
  "Crunch": "Crunches",
  "Hanging leg raise": "Hanging Leg Raise",
  "Cable crunch": "Cable Crunch",
  "Russian twist": "Russian Twist",
  "Ab wheel rollout": "Ab Roller",
  "Mountain climber": "Mountain Climbers",
  "Dead bug": "Dead Bug",

  // ── Cardio ──────────────────────────────────────────────────────────────
  "Treadmill run": "Running, Treadmill",
  "Outdoor run": "Trail Running/Walking",
  "Cycling": "Bicycling",
  "Rowing machine": "Rowing, Stationary",
  "Elliptical": "Elliptical Trainer",
  "Stair climber": "Step Mill",
  "Jump rope": "Rope Jumping",
  "Incline walk": "Walking, Treadmill",
};
