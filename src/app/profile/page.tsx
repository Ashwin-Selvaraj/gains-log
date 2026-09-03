'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { mutate } from '@/lib/sync';
import { SkeletonBlock } from '@/components/Skeleton';
import { Stat, RateBar } from '@/components/StatCard';
import { STREAK_TARGET, type BmiBand } from '@/lib/profile';
import { BASE_SCOPES, CALENDAR_SCOPE } from '@/lib/scopes';
import { todayKey } from '@/lib/date';
import type { Profile } from '@/lib/account';

const BAND_COPY: Record<BmiBand, { label: string; tone: string }> = {
  under: { label: 'Underweight', tone: 'text-amber-600 dark:text-amber-400' },
  healthy: { label: 'Healthy range', tone: 'text-accent' },
  over: { label: 'Above range', tone: 'text-amber-600 dark:text-amber-400' },
  obese: { label: 'Well above range', tone: 'text-red-600 dark:text-red-400' },
};

export default function ProfilePage() {
  const [data, setData] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/profile?today=${todayKey()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((p: Profile) => {
        setData(p);
        setHeight(p.body.heightCm ? String(p.body.heightCm) : '');
        setWeight(p.body.currentKg ? String(p.body.currentKg) : '');
      })
      .catch(() => setError('Could not load your profile.'));
  }, []);

  /**
   * Height is a setting; weight is today's log entry. They are saved to
   * different places on purpose — height changes once in a decade, weight is a
   * daily measurement — but they are edited together here because "update my
   * numbers" is one intention, and making someone hunt for the scale reading on
   * the Today screen was the gap this fills.
   */
  async function saveBody() {
    const cm = height.trim() === '' ? null : Number(height);
    const kg = weight.trim() === '' ? null : Number(weight);

    if (cm !== null && (!Number.isFinite(cm) || cm < 80 || cm > 250)) {
      setError('Height should be between 80 and 250 cm.');
      return;
    }
    if (kg !== null && (!Number.isFinite(kg) || kg < 20 || kg > 400)) {
      setError('Weight should be between 20 and 400 kg.');
      return;
    }

    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const today = todayKey();
      await Promise.all([
        cm === null ? Promise.resolve() : mutate('/api/settings', 'PATCH', { heightCm: cm }),
        // Written against today's entry, so it shows up in the weight trend and
        // the report exactly as if it had been typed on the Today screen.
        kg === null
          ? Promise.resolve()
          : mutate(`/api/entries/${today}`, 'PATCH', { weightKg: kg }),
      ]);
      const fresh = await fetch(`/api/profile?today=${today}`).then((r) => r.json());
      setData(fresh);
      setSaved(true);
    } catch {
      setError('Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  if (error && !data) return <p className="mt-6 text-sm text-muted">{error}</p>;
  if (!data) {
    return (
      <div className="space-y-4 pt-1" aria-hidden>
        <div className="flex items-center gap-3.5">
          <SkeletonBlock className="h-14 w-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="h-4 w-52" />
          </div>
        </div>
        <SkeletonBlock className="h-36" />
        <SkeletonBlock className="h-64" />
        <SkeletonBlock className="h-72" />
      </div>
    );
  }

  const { user, streaks, body, habits, training, windowDays } = data;
  const band = body.band ? BAND_COPY[body.band] : null;

  return (
    <div className="space-y-4 pb-4">
      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3.5 pt-1">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- Google's avatar
          // CDN would need a next.config remote pattern for one 56px image.
          <img
            src={user.image}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full object-cover ring-1 ring-line"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-card text-xl font-semibold text-muted ring-1 ring-line">
            {(user.name ?? user.email)[0]?.toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">
            {user.name ?? user.email.split('@')[0]}
          </h1>
          <p className="truncate text-sm text-muted">{user.email}</p>
          {user.isAdmin && (
            <span className="mt-1 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-accent">
              Admin
            </span>
          )}
        </div>
      </header>

      {error && (
        <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {/* ── Streak ───────────────────────────────────────────────────────── */}
      <section className="card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="flex items-baseline gap-2">
              <span className="text-4xl font-black tabular-nums leading-none">
                {streaks.current}
              </span>
              <span className="text-sm font-medium text-muted">
                day{streaks.current === 1 ? '' : 's'} in a row
              </span>
            </p>
            <p className="mt-1.5 text-xs text-muted">
              Best ever {streaks.longest} day{streaks.longest === 1 ? '' : 's'}
            </p>
          </div>
          <span className="text-4xl" aria-hidden>
            {streaks.current >= STREAK_TARGET ? '🔥' : streaks.current > 0 ? '⚡' : '🌱'}
          </span>
        </div>

        {/* Dots to the milestone, so "5 days" is a visible destination rather
            than a number you have to remember. */}
        <div className="mt-4 flex gap-1.5" aria-hidden>
          {Array.from({ length: STREAK_TARGET }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                i < Math.min(streaks.current, STREAK_TARGET) ? 'bg-accent' : 'bg-line'
              }`}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {streaks.current >= STREAK_TARGET
            ? `${STREAK_TARGET}-day streak held. Keep it going.`
            : `${STREAK_TARGET - streaks.current} more day${
                STREAK_TARGET - streaks.current === 1 ? '' : 's'
              } to a ${STREAK_TARGET}-day streak.`}
        </p>

        {streaks.atRisk && (
          <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            Nothing logged today yet — log anything to keep the streak alive.
          </p>
        )}
      </section>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <section className="card space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Body</h2>

        <div className="grid grid-cols-3 gap-3">
          <Stat
            value={body.currentKg ?? '—'}
            unit={body.currentKg ? 'kg' : undefined}
            label={
              data.lastWeighedOn
                ? data.lastWeighedOn === todayKey()
                  ? 'Weighed today'
                  : // Short form: the full ISO date overflowed a third of a
                    // phone's width and truncated to "Weighed 2026…".
                    `Weighed ${new Date(`${data.lastWeighedOn}T00:00:00`).toLocaleDateString(
                      undefined,
                      { day: 'numeric', month: 'short' },
                    )}`
                : 'No weigh-in yet'
            }
          />
          <Stat
            value={
              body.changeKg == null
                ? '—'
                : `${body.changeKg >= 0 ? '+' : ''}${body.changeKg.toFixed(1)}`
            }
            unit={body.changeKg == null ? undefined : 'kg'}
            label={`Since ${body.startKg} kg`}
            tone={body.changeKg != null && body.changeKg > 0 ? 'accent' : 'ink'}
          />
          <Stat
            value={body.toGoalKg == null ? '—' : body.toGoalKg.toFixed(1)}
            unit={body.toGoalKg == null ? undefined : 'kg'}
            label={`To ${body.goalKg} kg goal`}
          />
        </div>

        <div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-accent transition-[width]"
              style={{ width: `${Math.round(body.progress * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {Math.round(body.progress * 100)}% of the way from {body.startKg} to {body.goalKg} kg
          </p>
        </div>

        {/* Always editable, not just when empty. Weight is a daily measurement
            and this is where people look for it; height was previously only
            askable once, with no way to correct a typo afterwards. */}
        <div className="border-t border-line pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="weight">
                Weight <span className="font-normal">(kg)</span>
              </label>
              <input
                id="weight"
                className="field text-center"
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder="—"
                value={weight}
                onChange={(e) => {
                  setWeight(e.target.value);
                  setSaved(false);
                }}
              />
            </div>
            <div>
              <label className="label" htmlFor="height">
                Height <span className="font-normal">(cm)</span>
              </label>
              <input
                id="height"
                className="field text-center"
                type="number"
                inputMode="decimal"
                step="0.5"
                placeholder="—"
                value={height}
                onChange={(e) => {
                  setHeight(e.target.value);
                  setSaved(false);
                }}
              />
            </div>
          </div>

          <button
            className="btn-primary mt-3 w-full"
            onClick={saveBody}
            disabled={saving || (!height && !weight)}
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
          </button>

          <p className="mt-2 text-xs text-muted">
            Weight is logged against today, so it appears in your trend and report.
          </p>
        </div>

        {body.heightCm != null && (
          <div className="border-t border-line pt-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold tabular-nums">
                  {body.bmi ? body.bmi.toFixed(1) : '—'}
                  <span className="ml-1.5 text-xs font-medium text-muted">BMI</span>
                </p>
                {band && <p className={`mt-0.5 text-sm font-medium ${band.tone}`}>{band.label}</p>}
              </div>
              <p className="text-right text-xs text-muted">
                {body.heightCm} cm
                {body.healthyRangeKg && (
                  <>
                    <br />
                    Healthy: {body.healthyRangeKg[0].toFixed(0)}–
                    {body.healthyRangeKg[1].toFixed(0)} kg
                  </>
                )}
              </p>
            </div>
            {/* Said plainly, because this app exists to help someone add muscle
                and BMI will eventually call that "overweight". */}
            <p className="mt-2.5 text-xs leading-relaxed text-muted">
              BMI only knows height and weight — it cannot tell muscle from fat. Gaining
              muscle on purpose will push it up, and that is the plan working, not failing.
            </p>
          </div>
        )}
      </section>

      {/* ── Consistency ──────────────────────────────────────────────────── */}
      <section className="card space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            Consistency
          </h2>
          <span className="text-xs text-muted">last {windowDays} days</span>
        </div>

        <div className="space-y-3">
          <RateBar label="🏋️ Workout" done={habits.workouts} total={habits.daysLogged} />
          <RateBar label="📘 Learning" done={habits.learning} total={habits.daysLogged} />
          <RateBar label="💧 Water" done={habits.water} total={habits.daysLogged} />
          <RateBar label="😴 Slept well" done={habits.sleptWell} total={habits.daysLogged} />
        </div>

        <div className="grid grid-cols-3 gap-3 border-t border-line pt-4">
          <Stat value={habits.daysLogged} label="Days logged" />
          <Stat
            value={habits.avgSleepHours ? habits.avgSleepHours.toFixed(1) : '—'}
            unit={habits.avgSleepHours ? 'hrs' : undefined}
            label="Avg sleep"
          />
          <Stat
            value={habits.avgWaterLitres ? habits.avgWaterLitres.toFixed(1) : '—'}
            unit={habits.avgWaterLitres ? 'L' : undefined}
            label="Avg water"
          />
        </div>
      </section>

      {/* ── Training ─────────────────────────────────────────────────────── */}
      <section className="card space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Training</h2>

        <div className="grid grid-cols-4 gap-3">
          <Stat value={training.sessions} label="Sessions" />
          <Stat value={training.totalSets} label="Sets" />
          <Stat value={training.exercises} label="Lifts" />
          <Stat
            value={
              training.totalVolumeKg >= 1000
                ? `${(training.totalVolumeKg / 1000).toFixed(1)}t`
                : training.totalVolumeKg
            }
            label="Volume"
          />
        </div>

        {training.topLifts.length > 0 && (
          <div className="space-y-1.5 border-t border-line pt-4">
            <p className="text-xs text-muted">Heaviest lifts</p>
            {training.topLifts.map((lift) => (
              <Link
                key={lift.key}
                href={`/exercise/${encodeURIComponent(lift.key)}`}
                className="flex items-center justify-between rounded-xl px-1 py-2 transition-colors active:bg-line/40"
              >
                <span className="truncate text-sm">{lift.name}</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">
                  {lift.weightKg} kg →
                </span>
              </Link>
            ))}
          </div>
        )}

        <Link href="/exercise" className="btn-quiet w-full">
          All exercises
        </Link>
      </section>

      {/* ── Google Calendar ──────────────────────────────────────────────── */}
      <section className="card">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Google Calendar
        </h2>
        <p className="mt-2 text-sm text-muted">
          {data.calendarConnected
            ? 'Connected. Meetings you mark for syncing appear on your calendar.'
            : 'Connect to push meetings to your calendar. Each meeting is opt-in — nothing syncs unless you switch it on.'}
        </p>
        <button
          className={data.calendarConnected ? 'btn-quiet mt-3 w-full' : 'btn-primary mt-3 w-full'}
          onClick={() =>
            // Asked for here rather than at sign-in, so people who never use
            // this are never shown a calendar-permission screen. prompt=consent
            // with offline access is what makes Google return a refresh token —
            // without one, syncing would break an hour after connecting.
            void signIn(
              'google',
              { callbackUrl: '/profile' },
              {
                scope: `${BASE_SCOPES} ${CALENDAR_SCOPE}`,
                access_type: 'offline',
                prompt: 'consent',
              },
            )
          }
        >
          {data.calendarConnected ? 'Reconnect' : 'Connect Google Calendar'}
        </button>
      </section>

      {/* ── Links ────────────────────────────────────────────────────────── */}
      <section className="card space-y-2">
        <Link href="/goals" className="btn-quiet w-full justify-between">
          <span>Goals &amp; targets</span>
          <span aria-hidden>→</span>
        </Link>
        {user.isAdmin && (
          <Link href="/admin" className="btn-quiet w-full justify-between">
            <span>Manage access</span>
            <span aria-hidden>→</span>
          </Link>
        )}
        {user.memberSince && (
          <p className="pt-1 text-center text-xs text-muted">
            Logging since {user.memberSince}
          </p>
        )}
      </section>
    </div>
  );
}
