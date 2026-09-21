'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDay, todayKey } from '@/lib/date';
import { renderCollage, pickCollageMeals, type CollageMeal } from '@/lib/collage';
import { SkeletonBlock } from '@/components/Skeleton';

type Meal = CollageMeal & {
  id: string;
  protein: number | null;
  source: string;
  createdAt: string;
};

type Day = {
  date: string;
  meals: Meal[];
  photoCount: number;
  totals: { kcal: number; protein: number };
};

const SLOT_ICON: Record<string, string> = {
  breakfast: '🌅',
  lunch: '☀️',
  snack: '🍎',
  dinner: '🌙',
};

/**
 * What you have actually eaten, with the photographs.
 *
 * Until now a meal photo was uploaded, shown once on the day it was taken, and
 * then never seen again — it existed in R2 and in the database and nowhere in
 * the app. This is where it goes.
 */
export function MealHistory() {
  const [days, setDays] = useState<Day[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [photosOnly, setPhotosOnly] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      const params = new URLSearchParams();
      if (before) params.set('before', before);
      if (photosOnly) params.set('photos', '1');
      const res = await fetch(`/api/meals/history?${params}`);
      if (!res.ok) throw new Error('Could not load your meals.');
      return (await res.json()) as { days: Day[]; nextCursor: string | null };
    },
    [photosOnly],
  );

  useEffect(() => {
    let cancelled = false;
    setDays(null);
    setError(null);
    load()
      .then((data) => {
        if (cancelled) return;
        setDays(data.days);
        setCursor(data.nextCursor);
      })
      .catch(() => !cancelled && setError('Could not load your meals.'));
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const data = await load(cursor);
      setDays((prev) => [...(prev ?? []), ...data.days]);
      setCursor(data.nextCursor);
    } catch {
      setError('Could not load more.');
    } finally {
      setLoadingMore(false);
    }
  }

  if (error) return <p className="card text-sm text-red-600 dark:text-red-400">{error}</p>;

  if (days === null) {
    return (
      <div className="space-y-3">
        <SkeletonBlock className="h-40" />
        <SkeletonBlock className="h-40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="flex cursor-pointer items-center gap-2.5 px-1">
        <input
          type="checkbox"
          checked={photosOnly}
          onChange={(e) => setPhotosOnly(e.target.checked)}
          className="h-4 w-4 accent-[rgb(var(--accent))]"
        />
        <span className="text-sm text-muted">Only days with photos</span>
      </label>

      {days.length === 0 && (
        <p className="card text-sm text-muted">
          {photosOnly
            ? 'No photographed meals yet — snap one from Today and it will show up here.'
            : 'Nothing logged yet.'}
        </p>
      )}

      {days.map((day) => (
        <DayCard key={day.date} day={day} />
      ))}

      {cursor && (
        <button
          type="button"
          className="btn-quiet w-full"
          onClick={() => void loadMore()}
          disabled={loadingMore}
        >
          {loadingMore ? 'Loading…' : 'Load older days'}
        </button>
      )}
    </div>
  );
}

function DayCard({ day }: { day: Day }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const shareable = pickCollageMeals(day.meals).length > 0;

  /**
   * Shares the day as one image, falling back to a download.
   *
   * navigator.share with files is what puts it in front of Instagram on a
   * phone; on a desktop browser that API either does not exist or refuses
   * files, so the same PNG is saved instead rather than the button doing
   * nothing and leaving you to guess why.
   */
  async function share() {
    setBusy(true);
    setNote(null);
    try {
      const blob = await renderCollage({
        dateLabel: formatDay(day.date, todayKey()),
        meals: day.meals,
        kcal: day.totals.kcal,
        protein: day.totals.protein,
      });
      const file = new File([blob], `gains-log-${day.date}.png`, { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `What I ate — ${day.date}` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        setNote('Saved to your downloads.');
      }
    } catch (err) {
      // An abort is the person changing their mind in the share sheet, not a
      // failure worth reporting back to them.
      if ((err as Error)?.name !== 'AbortError') {
        setNote(err instanceof Error ? err.message : 'Could not make that image.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-0">
      <header className="flex items-center gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">
            {formatDay(day.date, todayKey())}
          </h2>
          <p className="text-xs tabular-nums text-muted">
            {day.totals.kcal} kcal · {day.totals.protein} g protein ·{' '}
            {day.meals.length} {day.meals.length === 1 ? 'meal' : 'meals'}
          </p>
        </div>

        {shareable && (
          <button
            type="button"
            onClick={() => void share()}
            disabled={busy}
            className="flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl border border-line
                       bg-surface px-3 text-sm font-medium transition active:scale-95 disabled:opacity-50"
          >
            <span aria-hidden>↗</span>
            {busy ? 'Making…' : 'Share'}
          </button>
        )}
      </header>

      <ul className="grid grid-cols-2 gap-2 border-t border-line px-4 py-4 sm:grid-cols-3">
        {day.meals.map((meal) => (
          <li key={meal.id} className="min-w-0">
            <div className="relative aspect-square overflow-hidden rounded-xl bg-line/50">
              {meal.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- R2 is a
                // CDN with immutable cache headers; next/image would add a
                // resizing hop for no gain.
                <img
                  src={meal.photoUrl}
                  alt={meal.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-2xl">
                  {SLOT_ICON[meal.slot] ?? '🍽️'}
                </span>
              )}
            </div>
            <p className="mt-1.5 truncate text-xs font-medium">{meal.name}</p>
            <p className="truncate text-[11px] tabular-nums text-muted">
              {SLOT_ICON[meal.slot] ?? ''} {meal.calories ?? 0} kcal
            </p>
          </li>
        ))}
      </ul>

      {note && <p className="px-4 pb-3 text-xs text-muted">{note}</p>}
    </section>
  );
}
