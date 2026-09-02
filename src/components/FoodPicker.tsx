'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { describePortion, macrosFor } from '@/lib/nutrition';
import type { Food, Macros } from '@/lib/types';

type Props = {
  onPick: (pick: { foodId: string; grams: number; name: string; macros: Macros }) => void;
  onCancel?: () => void;
  /** "Add" on the Today screen, "Add to preset" in the preset editor. */
  actionLabel?: string;
};

const SEARCH_DEBOUNCE_MS = 200;

/**
 * Search a food, choose a portion in household units, see the macros before
 * committing. Portions default to servings ("2 idli") rather than grams,
 * because nobody weighs breakfast — grams stay available for the cases where
 * you do know them.
 */
export function FoodPicker({ onPick, onCancel, actionLabel = 'Add' }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [selected, setSelected] = useState<Food | null>(null);
  const [servings, setServings] = useState('1');
  const [gramsMode, setGramsMode] = useState(false);
  const [grams, setGrams] = useState('100');
  const [loading, setLoading] = useState(false);

  // Debounced so typing "chicken" is one request, not eight.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    if (selected) return;

    timer.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/foods?q=${encodeURIComponent(query)}&limit=25`)
        .then((r) => r.json() as Promise<Food[]>)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer.current);
  }, [query, selected]);

  const chosenGrams = selected
    ? gramsMode
      ? Number(grams) || 0
      : (Number(servings) || 0) * selected.servingGrams
    : 0;

  const macros = selected && chosenGrams > 0 ? macrosFor(selected, chosenGrams) : null;

  const reset = useCallback(() => {
    setSelected(null);
    setServings('1');
    setGrams('100');
    setGramsMode(false);
    setQuery('');
  }, []);

  // ── portion step ────────────────────────────────────────────────────────
  if (selected) {
    return (
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-medium">{selected.name}</p>
            <p className="text-xs tabular-nums text-muted">
              {selected.kcalPer100g} kcal · P {selected.proteinPer100g} · C{' '}
              {selected.carbsPer100g} · F {selected.fatPer100g} per 100 g
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-sm text-muted"
            onClick={reset}
            aria-label="Choose a different food"
          >
            Change
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            className="field w-24 text-center"
            inputMode="decimal"
            value={gramsMode ? grams : servings}
            onChange={(e) =>
              gramsMode ? setGrams(e.target.value) : setServings(e.target.value)
            }
            aria-label={gramsMode ? 'Grams' : 'Number of servings'}
            autoFocus
          />
          <button
            type="button"
            onClick={() => setGramsMode(!gramsMode)}
            className="min-h-[44px] flex-1 rounded-xl border border-line bg-card px-3 text-sm"
          >
            {gramsMode ? 'grams' : `× ${selected.servingLabel}`}
            <span className="ml-1 text-xs text-muted">(tap to switch)</span>
          </button>
        </div>

        {macros && (
          <div className="rounded-xl bg-card p-3">
            <p className="text-lg font-bold tabular-nums">
              {macros.kcal} kcal
              <span className="ml-2 text-sm font-normal text-muted">
                {describePortion(selected, chosenGrams)}
              </span>
            </p>
            <p className="mt-0.5 text-sm tabular-nums text-muted">
              Protein <strong className="text-ink">{macros.protein} g</strong> · Carbs{' '}
              {macros.carbs} g · Fat {macros.fat} g · Fibre {macros.fiber} g
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={!macros || chosenGrams <= 0}
            onClick={() => {
              if (!selected || !macros) return;
              onPick({
                foodId: selected.id,
                grams: chosenGrams,
                name: selected.name,
                macros,
              });
              reset();
            }}
          >
            {actionLabel}
          </button>
          {onCancel && (
            <button
              type="button"
              className="btn-quiet"
              onClick={() => {
                reset();
                onCancel();
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── search step ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface p-3">
      <div className="flex gap-2">
        <input
          className="field"
          placeholder="Search food — dosa, chicken, curd…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search food"
          autoFocus
        />
        {onCancel && (
          <button type="button" className="btn-quiet shrink-0" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      {loading && results.length === 0 && (
        <p className="py-3 text-center text-sm text-muted">Searching…</p>
      )}

      {!loading && query && results.length === 0 && (
        <p className="py-3 text-center text-sm text-muted">
          No match for &ldquo;{query}&rdquo;. Add it on the Meals tab and it&apos;ll be
          searchable everywhere.
        </p>
      )}

      <ul className="max-h-72 divide-y divide-line overflow-y-auto">
        {results.map((food) => (
          <li key={food.id}>
            <button
              type="button"
              onClick={() => setSelected(food)}
              className="flex w-full items-center gap-3 py-2.5 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{food.name}</span>
                <span className="block text-xs tabular-nums text-muted">
                  {Math.round((food.kcalPer100g * food.servingGrams) / 100)} kcal ·{' '}
                  {Math.round((food.proteinPer100g * food.servingGrams) / 100 * 10) / 10} g
                  protein · per {food.servingLabel}
                </span>
              </span>
              <span aria-hidden className="shrink-0 text-muted">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
