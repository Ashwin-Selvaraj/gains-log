import { prisma } from '@/lib/prisma';
import { readSettings } from '@/lib/settings';

/**
 * Daily allowance for AI photo estimates.
 *
 * Every other feature costs nothing per use; a vision call costs real money on
 * an API key that belongs to one person. Without a cap, one invited friend
 * photographing their lunch repeatedly could run up a bill the owner never
 * agreed to — and would only find out afterwards.
 *
 * Admins are uncapped. There is exactly one admin today, the person paying for
 * the key, so this is "the bill-payer is not rate-limited against themselves".
 */
export const DAILY_AI_LIMIT = 5;

export type Quota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  /** True for admins, who have no cap. */
  unlimited: boolean;
  /** Local date the allowance is counted against, in the user's timezone. */
  date: string;
};

/**
 * The user's own calendar date.
 *
 * Derived from their stored timezone rather than taken from the request. A
 * client-supplied date would let anyone reset their own allowance by sending
 * tomorrow, and the server's date is wrong for everybody — it runs in
 * Singapore while the people using this are in India.
 */
function localDate(timezone: string): string {
  try {
    // en-CA formats as YYYY-MM-DD, which is the key format used everywhere else.
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('en-CA').format(new Date());
  }
}

export async function getQuota(user: {
  id: string;
  isAdmin: boolean;
}): Promise<Quota> {
  const { timezone } = await readSettings(user.id);
  const date = localDate(timezone);

  if (user.isAdmin) {
    const row = await prisma.aiUsage.findUnique({
      where: { userId_date: { userId: user.id, date } },
      select: { count: true },
    });
    return { used: row?.count ?? 0, limit: null, remaining: null, unlimited: true, date };
  }

  const row = await prisma.aiUsage.findUnique({
    where: { userId_date: { userId: user.id, date } },
    select: { count: true },
  });
  const used = row?.count ?? 0;
  return {
    used,
    limit: DAILY_AI_LIMIT,
    remaining: Math.max(0, DAILY_AI_LIMIT - used),
    unlimited: false,
    date,
  };
}

/**
 * Records one call against today's allowance and returns the updated quota.
 *
 * Called *after* the model has answered, so a request that fails before
 * reaching Anthropic — an unsupported file, a dropped connection — costs
 * nothing and consumes nothing. The upsert's `increment` makes the write
 * atomic, so two photos submitted at once cannot both read "3 used" and both
 * store 4.
 */
export async function recordAiUse(user: {
  id: string;
  isAdmin: boolean;
}): Promise<Quota> {
  const { timezone } = await readSettings(user.id);
  const date = localDate(timezone);

  const row = await prisma.aiUsage.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: { userId: user.id, date, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  return user.isAdmin
    ? { used: row.count, limit: null, remaining: null, unlimited: true, date }
    : {
        used: row.count,
        limit: DAILY_AI_LIMIT,
        remaining: Math.max(0, DAILY_AI_LIMIT - row.count),
        unlimited: false,
        date,
      };
}
