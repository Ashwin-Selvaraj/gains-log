import { addDays, daysBetween, isoWeekKey, type DateKey } from '@/lib/date';

/**
 * Quests: things you already do in the app, paid in GAINS.
 *
 * Pure — no Prisma, no chain — so the rules that draw the progress bars are
 * the very same rules the server re-runs before it pays anything. A quest the
 * screen calls "ready" and the server refuses would be the worst bug here.
 *
 * Design rules for the list itself:
 * - Every quest is earned from data the app already records. Nothing new to
 *   log, no honour-system checkboxes.
 * - Mix one-off milestones (a reason to come back next month) with dailies and
 *   weeklies (a reason to come back tomorrow).
 * - Claim windows are short: today/yesterday, this week/last week. Generous
 *   enough that a missed tap isn't a missed reward, tight enough that nobody
 *   farms a year of back-filled logs.
 */

export type DaySnap = {
  date: DateKey;
  /** Anything recorded at all — the same test the profile streak uses. */
  logged: boolean;
  trained: boolean;
  mealSlots: string[];
  protein: number;
  photoMeals: number;
  waterDone: boolean;
};

export type Snapshot = {
  today: DateKey;
  /** Every day with an entry, any order. */
  days: DaySnap[];
  proteinTarget: number;
  lifetimeVolumeKg: number;
  pledgesWon: number;
  streak: { current: number; longest: number };
};

export type Category = 'season' | 'streak' | 'fuel' | 'iron' | 'pledge';
export type Repeat = 'once' | 'daily' | 'weekly' | 'season';

export type Progress = { label: string; current: number; target: number; unit: string };

type Period = { key: string; label: string; dates?: DateKey[] };

export type Rule = {
  key: string;
  emoji: string;
  title: string;
  /** What you actually have to do, plainly. */
  how: string;
  /** The joke. Shown smaller, under `how`. */
  quip: string;
  category: Category;
  repeat: Repeat;
  amount: number;
  /** Season quests only: visible from `start`, claimable until `claimUntil`. */
  window?: { start: DateKey; end: DateKey; claimUntil: DateKey };
  progress: (s: Snapshot, period: Period) => Progress[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

const MAIN_MEALS = ['breakfast', 'lunch', 'dinner'];

function byDate(s: Snapshot): Map<DateKey, DaySnap> {
  return new Map(s.days.map((d) => [d.date, d]));
}

/** Monday-to-Sunday dates of the week containing `day`, shifted by `weeks`. */
export function weekDates(day: DateKey, weeks = 0): DateKey[] {
  const [y, m, d] = day.split('-').map(Number);
  const mondayIndex = (new Date(y, m - 1, d).getDay() + 6) % 7;
  const monday = addDays(day, -mondayIndex + weeks * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

function countIn(s: Snapshot, dates: DateKey[], test: (d: DaySnap) => boolean): number {
  const map = byDate(s);
  return dates.filter((date) => {
    const d = map.get(date);
    return d ? test(d) : false;
  }).length;
}

const fullFood = (d: DaySnap) => MAIN_MEALS.every((slot) => d.mealSlots.includes(slot));
const proteinHit = (target: number) => (d: DaySnap) => target > 0 && d.protein >= target;

function streakRule(
  key: string,
  days: number,
  amount: number,
  emoji: string,
  title: string,
  quip: string,
): Rule {
  return {
    key,
    emoji,
    title,
    how: `Log something ${days} days in a row.`,
    quip,
    category: 'streak',
    repeat: 'once',
    amount,
    // Best-ever run, so a streak that already happened still counts — the
    // current run is shown alongside so there's something to chase.
    progress: (s) => [
      { label: 'Best streak', current: Math.min(s.streak.longest, days), target: days, unit: 'days' },
    ],
  };
}

function volumeRule(
  key: string,
  kg: number,
  amount: number,
  emoji: string,
  title: string,
  quip: string,
): Rule {
  return {
    key,
    emoji,
    title,
    how: `Lift ${kg.toLocaleString()} kg in total (reps × weight, all time).`,
    quip,
    category: 'iron',
    repeat: 'once',
    amount,
    progress: (s) => [
      { label: 'Lifetime volume', current: Math.min(Math.round(s.lifetimeVolumeKg), kg), target: kg, unit: 'kg' },
    ],
  };
}

// ── The quests ─────────────────────────────────────────────────────────────

export const RULES: Rule[] = [
  // Season — the headline event. Winter Arc is the internet's name for using
  // the last quarter of the year to come out the other side a different
  // person, which is exactly what this app is for.
  {
    key: 'winter-arc-2026',
    emoji: '❄️',
    title: "Winter Arc '26",
    how: 'Between 1 Oct and 31 Dec: log on 75 days and train on 36 of them.',
    quip: 'Everyone else hibernates. You come out of December as the sequel.',
    category: 'season',
    repeat: 'season',
    amount: 250,
    window: { start: '2026-10-01', end: '2026-12-31', claimUntil: '2027-01-14' },
    progress: (s) => {
      const end = s.today < '2026-12-31' ? s.today : '2026-12-31';
      const span = Math.max(0, daysBetween('2026-10-01', end) + 1);
      const dates = Array.from({ length: span }, (_, i) => addDays('2026-10-01', i));
      return [
        { label: 'Days logged', current: Math.min(countIn(s, dates, (d) => d.logged), 75), target: 75, unit: 'days' },
        { label: 'Days trained', current: Math.min(countIn(s, dates, (d) => d.trained), 36), target: 36, unit: 'days' },
      ];
    },
  },

  // Streaks
  streakRule('streak-5', 5, 10, '🔥', 'Spark Plug', 'Five days straight. The couch has started asking questions.'),
  streakRule('streak-10', 10, 20, '⚡', 'Double Digits', "Ten days. You're officially someone who does this."),
  streakRule('streak-15', 15, 30, '🌶️', 'Spicy Fifteen', 'Half a month. Your excuses have filed a missing-person report.'),
  streakRule('streak-30', 30, 75, '👑', 'Month Monarch', 'Thirty days. The habit works for you now. Bow accepted.'),
  streakRule('streak-100', 100, 300, '🦾', 'Centurion', 'Triple digits. Legends are made of exactly this.'),

  // Fuel
  {
    key: 'clean-plate',
    emoji: '🍽️',
    title: 'Clean Plate Club',
    how: 'Log breakfast, lunch and dinner in one day.',
    quip: 'Three meals on the record. Your macros finally have witnesses.',
    category: 'fuel',
    repeat: 'daily',
    amount: 2,
    progress: (s, p) => {
      const d = byDate(s).get(p.key);
      const have = d ? MAIN_MEALS.filter((m) => d.mealSlots.includes(m)).length : 0;
      return [{ label: 'Main meals', current: have, target: 3, unit: 'meals' }];
    },
  },
  {
    key: 'meal-prep-monk',
    emoji: '🧘',
    title: 'Meal Prep Monk',
    how: 'Log breakfast, lunch and dinner on all 7 days of a week.',
    quip: 'Twenty-one meals, zero mystery snacks. Inner peace achieved.',
    category: 'fuel',
    repeat: 'weekly',
    amount: 15,
    progress: (s, p) => [
      { label: 'Fully logged days', current: countIn(s, p.dates!, fullFood), target: 7, unit: 'days' },
    ],
  },
  {
    key: 'protein-pilgrim',
    emoji: '🥩',
    title: 'Protein Pilgrim',
    how: 'Hit your protein target on 5 days in a week.',
    quip: 'Your muscles have written you a thank-you note. It just says "more".',
    category: 'fuel',
    repeat: 'weekly',
    amount: 10,
    progress: (s, p) => [
      {
        label: 'Protein days',
        current: Math.min(countIn(s, p.dates!, proteinHit(s.proteinTarget)), 5),
        target: 5,
        unit: 'days',
      },
    ],
  },
  {
    key: 'hydro-homie',
    emoji: '💧',
    title: 'Hydro Homie',
    how: 'Hit your water target on 6 days in a week.',
    quip: 'Houseplants are jealous of your hydration.',
    category: 'fuel',
    repeat: 'weekly',
    amount: 5,
    progress: (s, p) => [
      { label: 'Water days', current: Math.min(countIn(s, p.dates!, (d) => d.waterDone), 6), target: 6, unit: 'days' },
    ],
  },
  {
    key: 'food-paparazzi',
    emoji: '📸',
    title: 'Food Paparazzi',
    how: 'Log 25 meals with a photo.',
    quip: 'Your camera roll is now 40% chicken and rice. Iconic.',
    category: 'fuel',
    repeat: 'once',
    amount: 15,
    progress: (s) => {
      const n = s.days.reduce((sum, d) => sum + d.photoMeals, 0);
      return [{ label: 'Photo meals', current: Math.min(n, 25), target: 25, unit: 'meals' }];
    },
  },

  // Iron
  {
    key: 'iron-week',
    emoji: '🏋️',
    title: 'Iron Week',
    how: 'Train on 4 days in a week.',
    quip: 'Four sessions. The front desk knows your name now.',
    category: 'iron',
    repeat: 'weekly',
    amount: 10,
    progress: (s, p) => [
      { label: 'Training days', current: Math.min(countIn(s, p.dates!, (d) => d.trained), 4), target: 4, unit: 'days' },
    ],
  },
  volumeRule('t-rex', 10_000, 20, '🦖', 'T. rex Tamer', "That's more than a whole T. rex weighed. Rawr, respectfully."),
  volumeRule('jumbo', 50_000, 60, '✈️', 'Cleared for Takeoff', "Heavier than an empty Boeing 737. You're the runway now."),
  volumeRule('blue-whale', 150_000, 150, '🐋', 'Whale of a Time', 'A full-grown blue whale, moved one rep at a time. Moby who?'),

  // Pledges
  {
    key: 'skin-in-the-game',
    emoji: '🎯',
    title: 'Skin in the Game',
    how: 'Win your first pledge.',
    quip: 'You bet on yourself and won. Turns out you were a safe bet.',
    category: 'pledge',
    repeat: 'once',
    amount: 15,
    progress: (s) => [{ label: 'Pledges won', current: Math.min(s.pledgesWon, 1), target: 1, unit: 'won' }],
  },
  {
    key: 'hat-trick',
    emoji: '🎩',
    title: 'Hat Trick',
    how: 'Win 3 pledges.',
    quip: 'Three for three. The house is getting nervous.',
    category: 'pledge',
    repeat: 'once',
    amount: 40,
    progress: (s) => [{ label: 'Pledges won', current: Math.min(s.pledgesWon, 3), target: 3, unit: 'won' }],
  },
];

export const CATEGORY_LABEL: Record<Category, string> = {
  season: 'Season',
  streak: 'Streaks',
  fuel: 'Fuel',
  iron: 'Iron',
  pledge: 'Pledges',
};

// ── Periods ────────────────────────────────────────────────────────────────

/**
 * The periods a quest can currently be claimed for, newest first.
 *
 * Today and yesterday for dailies, this week and last for weeklies: a reward
 * earned late on Sunday is still there on Monday morning.
 */
export function periodsFor(rule: Rule, today: DateKey): Period[] {
  switch (rule.repeat) {
    case 'once':
      return [{ key: 'once', label: '' }];
    case 'daily':
      return [
        { key: today, label: 'Today' },
        { key: addDays(today, -1), label: 'Yesterday' },
      ];
    case 'weekly': {
      const thisWeek = weekDates(today);
      const lastWeek = weekDates(today, -1);
      return [
        { key: isoWeekKey(thisWeek[0]), label: 'This week', dates: thisWeek },
        { key: isoWeekKey(lastWeek[0]), label: 'Last week', dates: lastWeek },
      ];
    }
    case 'season':
      return [{ key: rule.key, label: '' }];
  }
}

/** Whether a quest is on the board at all today. Seasons come and go. */
export function isVisible(rule: Rule, today: DateKey): boolean {
  if (!rule.window) return true;
  return today >= rule.window.start && today <= rule.window.claimUntil;
}

export function isMet(progress: Progress[]): boolean {
  return progress.every((p) => p.current >= p.target);
}

export type QuestView = {
  key: string;
  emoji: string;
  title: string;
  how: string;
  quip: string;
  category: Category;
  repeat: Repeat;
  amount: number;
  /** Progress for the period shown on the card (the current one). */
  progress: Progress[];
  periodLabel: string;
  /** Periods that are met and not yet paid, oldest first — claim these. */
  claimable: { periodKey: string; label: string }[];
  /** True when the current period (or the one-off) is already paid. */
  claimedNow: boolean;
  timesClaimed: number;
  window?: Rule['window'];
};

/**
 * Every visible quest, with progress and what's claimable, given which
 * (rule, period) pairs are already paid.
 */
export function evaluate(snapshot: Snapshot, paid: Set<string>, timesClaimed: Map<string, number>): QuestView[] {
  return RULES.filter((r) => isVisible(r, snapshot.today)).map((rule) => {
    const periods = periodsFor(rule, snapshot.today);
    const claimable = periods
      .filter((p) => !paid.has(`${rule.key}:${p.key}`) && isMet(rule.progress(snapshot, p)))
      .map((p) => ({ periodKey: p.key, label: p.label }))
      .reverse();
    const current = periods[0];
    return {
      key: rule.key,
      emoji: rule.emoji,
      title: rule.title,
      how: rule.how,
      quip: rule.quip,
      category: rule.category,
      repeat: rule.repeat,
      amount: rule.amount,
      progress: rule.progress(snapshot, current),
      periodLabel: current.label,
      claimable,
      claimedNow: paid.has(`${rule.key}:${current.key}`),
      timesClaimed: timesClaimed.get(rule.key) ?? 0,
      window: rule.window,
    };
  });
}

/**
 * The server's final word before paying: is this exact (quest, period)
 * claimable right now for this snapshot?
 */
export function canClaim(snapshot: Snapshot, ruleKey: string, periodKey: string): Rule | null {
  const rule = RULES.find((r) => r.key === ruleKey);
  if (!rule || !isVisible(rule, snapshot.today)) return null;
  const period = periodsFor(rule, snapshot.today).find((p) => p.key === periodKey);
  if (!period) return null;
  return isMet(rule.progress(snapshot, period)) ? rule : null;
}
