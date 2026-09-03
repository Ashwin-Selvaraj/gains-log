/**
 * Runs once when the Next server starts.
 *
 * This is where the reminder scheduler lives. Self-hosting on a box with a
 * persistent Node process is what makes that possible at all — on serverless
 * there is nothing running at 9pm to send anything, which is why the earlier
 * version of this feature could only fire while the app was already open.
 */

const POLL_MS = 5 * 60 * 1000;

export async function register() {
  // Only the Node.js runtime; the Edge runtime has no timers that outlive a
  // request, and this must not run during `next build`.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  // Dev restarts this module on every change, which would stack timers.
  if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEV_SCHEDULER !== '1') {
    console.log('[scheduler] skipped in dev (set ENABLE_DEV_SCHEDULER=1 to run)');
    return;
  }

  const { runRemindersForAllUsers } = await import('@/lib/reminders');

  /**
   * Polls rather than firing on an exact cron tick.
   *
   * A cron that fires at exactly 21:00 loses the day's reminder if the process
   * happens to be restarting at 21:00 — which is precisely when a deploy tends
   * to happen. Polling every five minutes and asking "is it past the time, and
   * have I not sent yet?" survives restarts, clock drift and daylight-saving
   * shifts alike. The (kind, date) unique index makes the double-check free.
   */
  const tick = async () => {
    try {
      const { checked, sent } = await runRemindersForAllUsers();
      if (sent > 0) {
        console.log(`[scheduler] evening reminder sent for ${sent} of ${checked} user(s)`);
      }
    } catch (err) {
      // A failed tick must never take the server down with it.
      console.error('[scheduler] tick failed', err);
    }
  };

  // A short delay so the first tick doesn't compete with app startup.
  setTimeout(tick, 30_000);
  setInterval(tick, POLL_MS);

  console.log(`[scheduler] reminder poll every ${POLL_MS / 60000} min`);
}
