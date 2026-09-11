'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PhotoEstimate } from '@/components/PhotoEstimate';
import { mutate } from '@/lib/sync';
import { todayKey } from '@/lib/date';
import type { Macros } from '@/lib/types';

/**
 * Where the home-screen shortcut and a shared photo land.
 *
 * A page of its own rather than a deep link into Today, because a shortcut has
 * to arrive somewhere useful without asking anything of the layout. Pointing it
 * at Today meant scrolling this control into view, and that could not be made
 * to work: the scroll fires while the day is still loading, and the workout
 * card, the meals and the targets all grow above it afterwards, carrying the
 * target past wherever it was just scrolled to. Fixed delays and
 * settle-detection both failed the same way.
 *
 * With nothing above it there is nothing to scroll past. It is also simply the
 * better screen for the job: one thing, ready to use, one tap from the icon.
 */
export default function SnapPage() {
  const router = useRouter();
  const date = todayKey();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logMeal(meal: {
    name: string;
    macros: Macros;
    photoUrl: string | null;
    photoId?: string;
  }) {
    setSaving(true);
    setError(null);
    try {
      await mutate(`/api/entries/${date}/meals`, 'POST', {
        name: meal.name,
        calories: meal.macros.kcal,
        protein: meal.macros.protein,
        carbs: meal.macros.carbs,
        fat: meal.macros.fat,
        fiber: meal.macros.fiber,
        photoUrl: meal.photoUrl,
        photoId: meal.photoId,
        source: 'photo-estimate',
      });
      // Straight to Today, where the meal now is. Refreshed rather than
      // pushed, so the day is re-read from the server and shows it.
      router.push('/');
      router.refresh();
    } catch {
      setError('Could not save that meal. It is queued and will go up when you are back online.');
      setSaving(false);
    }
  }

  return (
    <>
      <header className="mb-4">
        <Link href="/" className="text-sm text-muted">
          ← Today
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Snap a meal</h1>
        <p className="text-sm text-muted">
          Photograph the plate. It gets named, portioned and added to today.
        </p>
      </header>

      {error && (
        <p className="card mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <section className="card">
        <PhotoEstimate date={date} onConfirm={(meal) => void logMeal(meal)} />
      </section>

      {saving && <p className="mt-3 text-sm text-muted">Saving…</p>}
    </>
  );
}
