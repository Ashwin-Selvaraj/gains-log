import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { SETTINGS_BOUNDS, getSettings } from '@/lib/settings';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  return NextResponse.json(await getSettings(user.id));
}

export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const body = (await req.json()) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  for (const key of Object.keys(SETTINGS_BOUNDS)) {
    if (!(key in body)) continue;
    const n = Number(body[key]);
    const [min, max] = SETTINGS_BOUNDS[key];
    if (!Number.isFinite(n) || n < min || n > max) {
      return NextResponse.json(
        { error: `${key} must be between ${min} and ${max}` },
        { status: 400 },
      );
    }
    // Only weight targets are fractional; the rest are whole numbers.
    data[key] = key.endsWith('Kg') ? n : Math.round(n);
  }

  // --- reminder settings, which aren't numeric bounds ---------------------
  if (body.reminderEnabled !== undefined) {
    data.reminderEnabled = Boolean(body.reminderEnabled);
  }
  if (body.reminderTime !== undefined) {
    const time = String(body.reminderTime).trim();
    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      return NextResponse.json({ error: 'reminderTime must be HH:MM' }, { status: 400 });
    }
    data.reminderTime = time;
  }
  if (body.timezone !== undefined) {
    const tz = String(body.timezone).trim();
    // Validated by asking Intl to use it — an invalid zone throws, and storing
    // one would make every reminder fire at the wrong time, silently.
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    } catch {
      return NextResponse.json({ error: `Unknown timezone: ${tz}` }, { status: 400 });
    }
    data.timezone = tz;
  }

  if (data.caloriesMin !== undefined && data.caloriesMax !== undefined
      && (data.caloriesMin as number) > (data.caloriesMax as number)) {
    return NextResponse.json(
      { error: 'Calorie floor cannot exceed the ceiling' },
      { status: 400 },
    );
  }

  return NextResponse.json(
    await prisma.settings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    }),
  );
}
