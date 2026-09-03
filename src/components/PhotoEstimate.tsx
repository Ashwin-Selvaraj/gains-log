'use client';

import { useEffect, useRef, useState } from 'react';
import { downscaleToDataUrl } from '@/lib/image';
import type { EstimatedItem, Macros, PhotoEstimate as Estimate } from '@/lib/types';

type Props = {
  onConfirm: (meal: {
    name: string;
    macros: Macros;
    photoUrl: string | null;
  }) => void;
};

/**
 * Downscale before upload. A modern phone camera shot is 3–8 MB, which is slow
 * on mobile data and gives the model nothing a 1024px image doesn't.
 *
 * Decoding lives in src/lib/image.ts, which falls back to an <img> element for
 * formats createImageBitmap refuses — HEIC, i.e. most iPhone photos.
 */
const downscale = (file: File, maxEdge = 1024) => downscaleToDataUrl(file, maxEdge, 0.82);

const sum = (items: EstimatedItem[]): Macros =>
  items.reduce<Macros>(
    (a, i) => ({
      kcal: a.kcal + i.macros.kcal,
      protein: Math.round((a.protein + i.macros.protein) * 10) / 10,
      carbs: Math.round((a.carbs + i.macros.carbs) * 10) / 10,
      fat: Math.round((a.fat + i.macros.fat) * 10) / 10,
      fiber: Math.round((a.fiber + i.macros.fiber) * 10) / 10,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );

/** Mirrors the shape returned by /api/estimate/quota. */
type Quota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
};

export function PhotoEstimate({ onConfirm }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [items, setItems] = useState<EstimatedItem[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);

  function reset() {
    setPhoto(null);
    setEstimate(null);
    setItems([]);
    setName('');
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  // Fetched up front so the allowance is visible before a photo is taken,
  // rather than only as an error after one has been framed and shot.
  useEffect(() => {
    fetch('/api/estimate/quota')
      .then((r) => (r.ok ? r.json() : null))
      .then((q: Quota | null) => q && setQuota(q))
      .catch(() => {});
  }, []);

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
      // The server returns the updated allowance on refusals and failures too,
      // so the counter stays right whichever way the call went.
      if (json.quota) setQuota(json.quota as Quota);
      if (!res.ok) throw new Error(json.error ?? 'Estimate failed');

      const est = json as Estimate;
      setEstimate(est);
      setItems(est.items);
      setName(est.mealName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  /** Rescaling grams rescales that item's macros — they're linear in weight. */
  function setGrams(index: number, nextGrams: number) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index || item.grams <= 0) return item;
        const factor = nextGrams / item.grams;
        return {
          ...item,
          grams: nextGrams,
          portionLabel: `${Math.round(nextGrams)} g`,
          macros: {
            kcal: Math.round(item.macros.kcal * factor),
            protein: Math.round(item.macros.protein * factor * 10) / 10,
            carbs: Math.round(item.macros.carbs * factor * 10) / 10,
            fat: Math.round(item.macros.fat * factor * 10) / 10,
            fiber: Math.round(item.macros.fiber * factor * 10) / 10,
          },
        };
      }),
    );
  }

  const totals = sum(items);
  /** Out of allowance. Admins are never capped, so `remaining` is null for them. */
  const spent = quota !== null && !quota.unlimited && (quota.remaining ?? 1) <= 0;

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
        <>
          <button
            type="button"
            className="btn-quiet w-full"
            disabled={busy || spent}
            onClick={() => inputRef.current?.click()}
          >
            {busy
              ? 'Identifying…'
              : spent
                ? 'No photo estimates left today'
                : '📷 Estimate from a photo'}
          </button>

          {quota && !quota.unlimited && quota.limit !== null && (
            <p className="px-1 text-xs text-muted">
              {spent ? (
                <>
                  You’ve used all {quota.limit} photo estimates for today — they reset at
                  midnight. Log this meal from a preset or the food list instead.
                </>
              ) : (
                <>
                  {quota.remaining} of {quota.limit} photo estimates left today.
                </>
              )}
            </p>
          )}
        </>
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
              <p
                className={
                  estimate.unclear ? 'text-amber-600 dark:text-amber-400' : 'text-muted'
                }
              >
                {estimate.unclear ? '⚠️ ' : ''}
                {estimate.caveat}
              </p>
              <p className="mt-1 text-xs text-muted">
                Portions are estimates — adjust the grams on anything that looks off.
              </p>
            </div>
          </div>

          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Meal name"
            aria-label="Meal name"
          />

          <ul className="divide-y divide-line">
            {items.map((item, i) => (
              <li key={`${item.name}-${i}`} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.matchedName ?? item.name}
                    {!item.recognised && (
                      <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                        not in food list
                      </span>
                    )}
                  </p>
                  <p className="text-xs tabular-nums text-muted">
                    {item.recognised
                      ? `${item.macros.kcal} kcal · ${item.macros.protein} g protein`
                      : 'No macros — add this food on the Meals tab'}
                  </p>
                </div>
                <input
                  className="field w-20 shrink-0 px-2 text-center text-sm"
                  inputMode="numeric"
                  value={String(Math.round(item.grams))}
                  onChange={(e) => setGrams(i, Number(e.target.value) || 0)}
                  aria-label={`Grams of ${item.matchedName ?? item.name}`}
                />
                <span className="shrink-0 text-xs text-muted">g</span>
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${item.matchedName ?? item.name}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          <div className="rounded-xl bg-card p-3">
            <p className="text-lg font-bold tabular-nums">
              {totals.kcal} kcal
              <span className="ml-2 text-sm font-normal text-muted">total</span>
            </p>
            <p className="mt-0.5 text-sm tabular-nums text-muted">
              Protein <strong className="text-ink">{totals.protein} g</strong> · Carbs{' '}
              {totals.carbs} g · Fat {totals.fat} g · Fibre {totals.fiber} g
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={!name.trim() || items.length === 0}
              onClick={() => {
                onConfirm({ name: name.trim(), macros: totals, photoUrl: photo });
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
