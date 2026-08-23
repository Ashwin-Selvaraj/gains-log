'use client';

import { useRef, useState } from 'react';
import type { PhotoEstimate as Estimate } from '@/lib/types';

type Props = {
  onConfirm: (meal: {
    name: string;
    calories: number | null;
    protein: number | null;
    photoUrl: string | null;
  }) => void;
};

/**
 * Downscale before upload. A modern phone camera shot is 3–8 MB, which is slow
 * on mobile data and gives the model nothing a 1024px image doesn't.
 */
async function downscale(file: File, maxEdge = 1024): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return canvas.toDataURL('image/jpeg', 0.82);
}

export function PhotoEstimate({ onConfirm }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPhoto(null);
    setEstimate(null);
    setName('');
    setCalories('');
    setProtein('');
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await downscale(file);
      // The stored copy is a thumbnail — a full 1024px data URL per meal would
      // bloat the database for something only ever shown 80px wide.
      setPhoto(await downscale(file, 256));

      const res = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Estimate failed');

      const est = json as Estimate;
      setEstimate(est);
      setName(est.name);
      setCalories(String(est.calories));
      setProtein(String(est.protein));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {!estimate && (
        <button
          type="button"
          className="btn-quiet w-full"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? 'Asking Claude…' : '📷 Estimate from a photo'}
        </button>
      )}

      {error && (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {estimate && (
        <div className="space-y-3 rounded-2xl border border-line bg-surface p-3">
          <div className="flex gap-3">
            {photo && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photo}
                alt="The plate you photographed"
                className="h-20 w-20 shrink-0 rounded-xl object-cover"
              />
            )}
            <div className="min-w-0 text-sm">
              <p className="text-muted">{estimate.items.join(' · ')}</p>
              <p
                className={`mt-1 ${
                  estimate.unclear ? 'text-amber-600 dark:text-amber-400' : 'text-muted'
                }`}
              >
                {estimate.unclear ? '⚠️ ' : ''}
                {estimate.caveat}
              </p>
            </div>
          </div>

          <p className="text-xs text-muted">
            Rough estimate — check the numbers before saving.
          </p>

          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Meal name"
            aria-label="Meal name"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="field"
              inputMode="numeric"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              placeholder="kcal"
              aria-label="Calories"
            />
            <input
              className="field"
              inputMode="numeric"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              placeholder="protein g"
              aria-label="Protein in grams"
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={!name.trim()}
              onClick={() => {
                onConfirm({
                  name: name.trim(),
                  calories: calories === '' ? null : Number(calories),
                  protein: protein === '' ? null : Number(protein),
                  photoUrl: photo,
                });
                reset();
              }}
            >
              Save meal
            </button>
            <button type="button" className="btn-quiet" onClick={reset}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
