import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isDateKey } from '@/lib/date';
import { withJoins } from '@/lib/db-strategy';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * What you have eaten, with the photographs, newest first.
 *
 * Separate from /api/history, which returns whole days — meetings, sets,
 * habits and all — and deliberately drops photoUrl to keep the payload small.
 * That exclusion made sense when a photo estimate stored a base64 thumbnail on
 * the meal row and a month of them was megabytes; photos have lived in R2 since
 * then, so what travels now is an 80-character URL. This route exists because
 * the question is different, not because the old one was wrong: "show me the
 * food I've eaten" wants meals grouped by day with their pictures, not days
 * with their meals among everything else.
 *
 * Grouped by date server-side because that is the unit the screen renders and
 * the unit a shared collage is built from — one day, its meals, its totals.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const params = new URL(req.url).searchParams;
  const take = Math.min(Number(params.get('limit') ?? 14) || 14, 60);
  const before = params.get('before');
  /** Only days that actually have a photograph — the point of this screen. */
  const withPhotos = params.get('photos') === '1';

  const days = await prisma.dailyEntry.findMany({
    where: {
      userId: user.id,
      ...(before && isDateKey(before) ? { date: { lt: before } } : {}),
      meals: withPhotos ? { some: { photoUrl: { not: null } } } : { some: {} },
    },
    select: {
      date: true,
      meals: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          slot: true,
          calories: true,
          protein: true,
          photoUrl: true,
          source: true,
          createdAt: true,
        },
      },
    },
    orderBy: { date: 'desc' },
    // One more than asked for, to know whether another page exists without a
    // second count query.
    take: take + 1,
    ...withJoins,
  });

  const page = days.slice(0, take);

  return NextResponse.json({
    days: page.map((day) => ({
      date: day.date,
      meals: day.meals,
      photoCount: day.meals.filter((m) => m.photoUrl).length,
      totals: {
        kcal: day.meals.reduce((sum, m) => sum + (m.calories ?? 0), 0),
        protein:
          Math.round(day.meals.reduce((sum, m) => sum + (m.protein ?? 0), 0) * 10) / 10,
      },
    })),
    nextCursor: days.length > take ? page[page.length - 1]?.date ?? null : null,
  });
}
