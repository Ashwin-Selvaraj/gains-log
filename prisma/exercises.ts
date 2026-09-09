/**
 * Seed data for the Exercise catalogue.
 *
 * The point of this list is that everyone logging a bench press writes it the
 * same way. Before it existed, logging was free text against a datalist of
 * whatever you'd already typed that day, so a lift acquired two or three
 * spellings and its PR history split silently between them.
 *
 * Scope is deliberately "a normal gym", not exhaustive: common barbell,
 * dumbbell, machine and bodyweight movements, plus the cardio you'd actually
 * log. Anything missing can be added from the app in one tap, which is the
 * escape hatch that lets this list stay short enough to scroll.
 *
 * Aliases carry the names people actually type — "bp", "ohp", "rdl", "lat
 * pulldown" for the machine spelled "Lat pull-down" — so search finds a lift
 * by whatever it's called in your head.
 *
 * Tuple order: name, muscleGroup, aliases
 */

export type ExerciseSeed = [name: string, muscleGroup: string, aliases: string];

export const EXERCISES: ExerciseSeed[] = [
  // ── Chest ───────────────────────────────────────────────────────────────
  ['Bench press', 'chest', 'bp,barbell bench,flat bench,bench'],
  ['Incline bench press', 'chest', 'incline bench,incline press'],
  ['Decline bench press', 'chest', 'decline bench,decline press'],
  ['Dumbbell bench press', 'chest', 'db bench,dumbbell press'],
  ['Incline dumbbell press', 'chest', 'incline db press,incline dumbbell bench'],
  ['Chest fly', 'chest', 'dumbbell fly,flyes,flies,pec fly'],
  ['Cable crossover', 'chest', 'cable fly,crossover'],
  ['Pec deck', 'chest', 'machine fly,pec dec'],
  ['Machine chest press', 'chest', 'chest press machine'],
  ['Push-up', 'chest', 'pushup,press up'],
  ['Dips', 'chest', 'chest dips,parallel bar dips'],

  // ── Back ────────────────────────────────────────────────────────────────
  ['Deadlift', 'back', 'conventional deadlift,dl'],
  ['Romanian deadlift', 'back', 'rdl,romanian dl,stiff leg deadlift'],
  ['Barbell row', 'back', 'bent over row,bb row,pendlay row'],
  ['Dumbbell row', 'back', 'db row,single arm row,one arm row'],
  ['Pull-up', 'back', 'pullup,pull ups'],
  ['Chin-up', 'back', 'chinup,chin ups'],
  ['Lat pulldown', 'back', 'lat pull down,pulldown,lat pull'],
  ['Seated cable row', 'back', 'cable row,seated row'],
  ['T-bar row', 'back', 't bar row,tbar row'],
  ['Machine row', 'back', 'hammer row,chest supported row'],
  ['Straight-arm pulldown', 'back', 'straight arm pulldown,pullover cable'],
  ['Face pull', 'back', 'facepull,rear delt cable'],
  ['Shrug', 'back', 'barbell shrug,dumbbell shrug,traps'],
  ['Back extension', 'back', 'hyperextension,45 degree extension'],

  // ── Shoulders ───────────────────────────────────────────────────────────
  ['Overhead press', 'shoulders', 'ohp,military press,strict press,shoulder press'],
  ['Dumbbell shoulder press', 'shoulders', 'db shoulder press,seated dumbbell press'],
  ['Arnold press', 'shoulders', 'arnolds'],
  ['Lateral raise', 'shoulders', 'side raise,lat raise,side lateral'],
  ['Front raise', 'shoulders', 'front delt raise'],
  ['Rear delt fly', 'shoulders', 'reverse fly,rear delt raise,bent over fly'],
  ['Upright row', 'shoulders', 'upright rows'],
  ['Machine shoulder press', 'shoulders', 'shoulder press machine'],

  // ── Arms ────────────────────────────────────────────────────────────────
  ['Barbell curl', 'arms', 'bb curl,bicep curl,barbell bicep curl'],
  ['Dumbbell curl', 'arms', 'db curl,alternating curl'],
  ['Hammer curl', 'arms', 'hammers,neutral curl'],
  ['Preacher curl', 'arms', 'ez bar preacher,scott curl'],
  ['Cable curl', 'arms', 'cable bicep curl'],
  ['Concentration curl', 'arms', 'concentration curls'],
  ['Triceps pushdown', 'arms', 'tricep pushdown,cable pushdown,rope pushdown'],
  ['Overhead triceps extension', 'arms', 'overhead extension,french press,skull crusher standing'],
  ['Skull crusher', 'arms', 'lying triceps extension,skullcrusher'],
  ['Close-grip bench press', 'arms', 'close grip bench,cgbp'],
  ['Triceps dip', 'arms', 'bench dip,tricep dips'],
  ['Wrist curl', 'arms', 'forearm curl'],

  // ── Legs ────────────────────────────────────────────────────────────────
  ['Back squat', 'legs', 'squat,barbell squat,bb squat'],
  ['Front squat', 'legs', 'front squats'],
  ['Goblet squat', 'legs', 'goblet squats'],
  ['Leg press', 'legs', 'leg press machine'],
  ['Hack squat', 'legs', 'hack squat machine'],
  ['Bulgarian split squat', 'legs', 'bulgarian,rear foot elevated split squat,rfess'],
  ['Lunge', 'legs', 'walking lunge,lunges,reverse lunge'],
  ['Step-up', 'legs', 'step ups,box step up'],
  ['Leg extension', 'legs', 'quad extension,leg extensions'],
  ['Leg curl', 'legs', 'hamstring curl,lying leg curl,seated leg curl'],
  ['Calf raise', 'legs', 'standing calf raise,seated calf raise,calves'],
  ['Sissy squat', 'legs', 'sissy squats'],

  // ── Glutes ──────────────────────────────────────────────────────────────
  ['Hip thrust', 'glutes', 'barbell hip thrust,glute bridge barbell'],
  ['Glute bridge', 'glutes', 'bridge'],
  ['Cable kickback', 'glutes', 'glute kickback,donkey kick'],
  ['Hip abduction', 'glutes', 'abduction machine,abductor'],
  ['Sumo deadlift', 'glutes', 'sumo dl'],
  ['Good morning', 'glutes', 'good mornings'],

  // ── Core ────────────────────────────────────────────────────────────────
  ['Plank', 'core', 'front plank,forearm plank'],
  ['Side plank', 'core', 'side planks'],
  ['Crunch', 'core', 'crunches,sit up,situp'],
  ['Hanging leg raise', 'core', 'leg raise,hanging knee raise'],
  ['Cable crunch', 'core', 'kneeling cable crunch,rope crunch'],
  ['Russian twist', 'core', 'russian twists'],
  ['Ab wheel rollout', 'core', 'ab wheel,rollout'],
  ['Mountain climber', 'core', 'mountain climbers'],
  ['Dead bug', 'core', 'deadbug'],

  // ── Cardio ──────────────────────────────────────────────────────────────
  ['Treadmill run', 'cardio', 'running,run,treadmill'],
  ['Outdoor run', 'cardio', 'jog,jogging,road run'],
  ['Cycling', 'cardio', 'bike,stationary bike,spin'],
  ['Rowing machine', 'cardio', 'rower,erg,rowing'],
  ['Elliptical', 'cardio', 'cross trainer'],
  ['Stair climber', 'cardio', 'stairmaster,stairs'],
  ['Jump rope', 'cardio', 'skipping,skip rope'],
  ['Incline walk', 'cardio', 'treadmill walk,walking'],
];
