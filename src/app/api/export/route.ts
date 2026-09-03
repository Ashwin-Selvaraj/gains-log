import { prisma } from '@/lib/prisma';
import { todayKey } from '@/lib/date';
import { withJoins } from '@/lib/db-strategy';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** RFC 4180 quoting — notes contain commas and the odd newline. */
function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
  'date',
  'workout_done',
  'learning_done',
  'slept_well',
  'water_done',
  'water_litres',
  'weight_kg',
  'sleep_hours',
  'workout_note',
  'learning_note',
  'meetings_count',
  'meetings',
  'meals_count',
  'total_calories',
  'total_protein_g',
  'total_carbs_g',
  'total_fat_g',
  'total_fiber_g',
  'meals',
];

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const entries = await prisma.dailyEntry.findMany({
    where: { userId: user.id },
    include: { meetings: { orderBy: { time: 'asc' } }, meals: true },
    orderBy: { date: 'asc' },
    ...withJoins,
  });

  const rows = entries.map((e) =>
    [
      e.date,
      e.workoutDone,
      e.learningDone,
      e.sleptWell,
      e.waterDone,
      e.waterLitres,
      e.weightKg,
      e.sleepHours,
      e.workoutNote,
      e.learningNote,
      e.meetings.length,
      e.meetings.map((m) => `${m.time} ${m.title}`).join('; '),
      e.meals.length,
      e.meals.reduce((s, m) => s + (m.calories ?? 0), 0),
      e.meals.reduce((s, m) => s + (m.protein ?? 0), 0),
      Math.round(e.meals.reduce((s, m) => s + (m.carbs ?? 0), 0) * 10) / 10,
      Math.round(e.meals.reduce((s, m) => s + (m.fat ?? 0), 0) * 10) / 10,
      Math.round(e.meals.reduce((s, m) => s + (m.fiber ?? 0), 0) * 10) / 10,
      e.meals
        .map((m) => `${m.name} (${m.calories ?? '?'}kcal/${m.protein ?? '?'}gP)`)
        .join('; '),
    ]
      .map(csvCell)
      .join(','),
  );

  const csv = [HEADERS.join(','), ...rows].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="gains-log-${todayKey()}.csv"`,
    },
  });
}
