'use client';

import { useEffect, useState } from 'react';
import { mutate } from '@/lib/sync';
import { SkeletonBlock } from '@/components/Skeleton';
import { FoodPicker } from '@/components/FoodPicker';
import { describePortion, macrosFor, sumMacros } from '@/lib/nutrition';
import type { Food, Macros, Preset } from '@/lib/types';

type DraftItem = { foodId: string; name: string; grams: number };

const EMPTY: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

export default function MealsPage() {
  const [tab, setTab] = useState<'presets' | 'foods'>('presets');
  const [presets, setPresets] = useState<Preset[] | null>(null);

  useEffect(() => {
    fetch('/api/presets')
      .then((r) => r.json() as Promise<Preset[]>)
      .then(setPresets)
      .catch(() => setPresets([]));
  }, []);

  return (
    <>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Meals</h1>
        <p className="text-sm text-muted">
          Your regular combinations, and the food table they&apos;re built from.
        </p>
      </header>

      <div className="mb-4 flex gap-2">
        {(['presets', 'foods'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`min-h-[44px] flex-1 rounded-xl border text-sm font-medium capitalize transition
                        ${
                          tab === t
                            ? 'border-accent bg-accent/10 text-ink'
                            : 'border-line bg-card text-muted'
                        }`}
          >
            {t === 'presets' ? 'My combos' : 'Food table'}
          </button>
        ))}
      </div>

      {tab === 'presets' ? (
        <PresetsTab presets={presets} setPresets={setPresets} />
      ) : (
        <FoodsTab />
      )}
    </>
  );
}

/* ── Presets: combinations of foods ──────────────────────────────────────── */

function PresetsTab({
  presets,
  setPresets,
}: {
  presets: Preset[] | null;
  setPresets: React.Dispatch<React.SetStateAction<Preset[] | null>>;
}) {
  const [name, setName] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [foods, setFoods] = useState<Record<string, Food>>({});

  // Needed to recompute the draft's macros as items are added.
  useEffect(() => {
    fetch('/api/foods?limit=500')
      .then((r) => r.json() as Promise<Food[]>)
      .then((all) => setFoods(Object.fromEntries(all.map((f) => [f.id, f]))))
      .catch(() => {});
  }, []);

  const draftMacros = items.length
    ? sumMacros(
        items
          .filter((i) => foods[i.foodId])
          .map((i) => macrosFor(foods[i.foodId], i.grams)),
      )
    : EMPTY;

  function clearForm() {
    setName('');
    setItems([]);
    setEditing(null);
    setAdding(false);
  }

  async function save() {
    if (!name.trim() || items.length === 0) return;
    const payload = {
      name: name.trim(),
      items: items.map((i) => ({ foodId: i.foodId, grams: i.grams })),
    };
    try {
      if (editing) {
        const updated = await mutate<Preset>(`/api/presets/${editing}`, 'PATCH', payload);
        setPresets((prev) => prev!.map((p) => (p.id === editing ? updated : p)));
      } else {
        const created = await mutate<Preset>('/api/presets', 'POST', payload);
        setPresets((prev) => [...(prev ?? []), created]);
      }
      clearForm();
    } catch {
      /* offline outbox already queued it */
    }
  }

  async function remove(id: string) {
    setPresets((prev) => prev!.filter((p) => p.id !== id));
    if (editing === id) clearForm();
    await mutate(`/api/presets/${id}`, 'DELETE').catch(() => {});
  }

  return (
    <>
      <section className="card mb-4 space-y-3">
        <input
          className="field"
          placeholder="Combo name — e.g. post-workout breakfast"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Preset name"
        />

        {items.length > 0 && (
          <ul className="divide-y divide-line">
            {items.map((item, i) => (
              <li key={`${item.foodId}-${i}`} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs tabular-nums text-muted">
                    {foods[item.foodId]
                      ? describePortion(foods[item.foodId], item.grams)
                      : `${item.grams} g`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setItems(items.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${item.name}`}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {items.length > 0 && (
          <p className="rounded-xl bg-surface p-2.5 text-sm tabular-nums">
            <strong>{draftMacros.kcal} kcal</strong>
            <span className="text-muted">
              {' '}
              · P {draftMacros.protein} · C {draftMacros.carbs} · F {draftMacros.fat} ·
              Fib {draftMacros.fiber}
            </span>
          </p>
        )}

        {adding ? (
          <FoodPicker
            actionLabel="Add to combo"
            onCancel={() => setAdding(false)}
            onPick={({ foodId, grams, name: foodName }) => {
              setItems((prev) => [...prev, { foodId, grams, name: foodName }]);
              setAdding(false);
            }}
          />
        ) : (
          <button type="button" className="btn-quiet w-full" onClick={() => setAdding(true)}>
            + Add a food
          </button>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            className="btn-primary flex-1"
            onClick={save}
            disabled={!name.trim() || items.length === 0}
          >
            {editing ? 'Save changes' : 'Save combo'}
          </button>
          {(editing || items.length > 0 || name) && (
            <button type="button" className="btn-quiet" onClick={clearForm}>
              Cancel
            </button>
          )}
        </div>
      </section>

      {presets === null && <SkeletonBlock className="h-56" />}

      {presets?.length === 0 && (
        <p className="card text-sm text-muted">
          No combos yet. Build the meals you eat most — breakfast is usually the same
          every day, so that&apos;s the one worth saving first.
        </p>
      )}

      {presets && presets.length > 0 && (
        <ul className="card divide-y divide-line !p-0">
          {presets.map((p) => (
            <li key={p.id} className="flex items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{p.name}</p>
                <p className="text-sm tabular-nums text-muted">
                  {p.macros.kcal} kcal · {p.macros.protein}g protein
                </p>
                {p.items.length > 0 && (
                  <p className="truncate text-xs text-muted">
                    {p.items.map((i) => i.name).join(' + ')}
                  </p>
                )}
                {p.legacy && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Not linked to the food table — edit to rebuild it from foods.
                  </p>
                )}
              </div>
              <button
                type="button"
                className="btn-quiet px-3"
                onClick={() => {
                  setEditing(p.id);
                  setName(p.name);
                  setItems(
                    p.items.map((i) => ({
                      foodId: i.foodId,
                      name: i.name,
                      grams: i.grams,
                    })),
                  );
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label={`Delete ${p.name}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl
                           text-muted hover:bg-line"
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ── Foods: the underlying table ─────────────────────────────────────────── */

const NEW_FOOD = {
  name: '',
  kcalPer100g: '',
  proteinPer100g: '',
  carbsPer100g: '',
  fatPer100g: '',
  fiberPer100g: '',
  servingLabel: '',
  servingGrams: '',
};

function FoodsTab() {
  const [query, setQuery] = useState('');
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [editing, setEditing] = useState<Food | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ ...NEW_FOOD });
  const [error, setError] = useState<string | null>(null);

  function load(q = query) {
    fetch(`/api/foods?q=${encodeURIComponent(q)}&limit=100`)
      .then((r) => r.json() as Promise<Food[]>)
      .then(setFoods)
      .catch(() => setFoods([]));
  }

  useEffect(() => {
    const t = setTimeout(() => load(query), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function saveNew() {
    setError(null);
    try {
      await mutate('/api/foods', 'POST', {
        name: draft.name,
        kcalPer100g: Number(draft.kcalPer100g) || 0,
        proteinPer100g: Number(draft.proteinPer100g) || 0,
        carbsPer100g: Number(draft.carbsPer100g) || 0,
        fatPer100g: Number(draft.fatPer100g) || 0,
        fiberPer100g: Number(draft.fiberPer100g) || 0,
        servingLabel: draft.servingLabel || '100 g',
        servingGrams: Number(draft.servingGrams) || 100,
      });
      setDraft({ ...NEW_FOOD });
      setCreating(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    }
  }

  async function saveEdit(food: Food) {
    await mutate(`/api/foods/${food.id}`, 'PATCH', food).catch(() => {});
    setEditing(null);
    load();
  }

  return (
    <>
      <p className="mb-3 text-xs text-muted">
        Values are per 100 g, from published composition tables. They&apos;re averages —
        if your dosa is oilier or your idli bigger, correct it here and every combo and
        future log picks it up.
      </p>

      <input
        className="field mb-3"
        placeholder="Search the food table…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search foods"
      />

      {creating ? (
        <section className="card mb-3 space-y-2">
          <input
            className="field"
            placeholder="Food name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            aria-label="Food name"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['kcalPer100g', 'kcal / 100g'],
                ['proteinPer100g', 'protein / 100g'],
                ['carbsPer100g', 'carbs / 100g'],
                ['fatPer100g', 'fat / 100g'],
                ['fiberPer100g', 'fibre / 100g'],
                ['servingGrams', 'serving grams'],
              ] as const
            ).map(([key, label]) => (
              <input
                key={key}
                className="field"
                inputMode="decimal"
                placeholder={label}
                value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                aria-label={label}
              />
            ))}
          </div>
          <input
            className="field"
            placeholder="Serving label — e.g. 1 dosa"
            value={draft.servingLabel}
            onChange={(e) => setDraft({ ...draft, servingLabel: e.target.value })}
            aria-label="Serving label"
          />
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={saveNew}
              disabled={!draft.name.trim()}
            >
              Add food
            </button>
            <button type="button" className="btn-quiet" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          className="btn-quiet mb-3 w-full"
          onClick={() => setCreating(true)}
        >
          + Add a food
        </button>
      )}

      {foods === null && <SkeletonBlock className="h-64" />}

      {foods && (
        <ul className="card divide-y divide-line !p-0">
          {foods.map((f) => (
            <li key={f.id} className="px-4 py-3">
              {editing?.id === f.id ? (
                <div className="space-y-2">
                  <p className="font-medium">{f.name}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['kcalPer100g', 'kcal'],
                        ['proteinPer100g', 'protein'],
                        ['carbsPer100g', 'carbs'],
                        ['fatPer100g', 'fat'],
                        ['fiberPer100g', 'fibre'],
                        ['servingGrams', 'serving g'],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="text-xs text-muted">
                        {label} / 100g
                        <input
                          className="field mt-0.5"
                          inputMode="decimal"
                          value={String(editing[key])}
                          onChange={(e) =>
                            setEditing({ ...editing, [key]: Number(e.target.value) || 0 })
                          }
                          aria-label={`${f.name} ${label}`}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary flex-1"
                      onClick={() => saveEdit(editing)}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn-quiet"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{f.name}</p>
                    <p className="text-xs tabular-nums text-muted">
                      {f.kcalPer100g} kcal · P {f.proteinPer100g} · C {f.carbsPer100g} · F{' '}
                      {f.fatPer100g} · Fib {f.fiberPer100g} — per 100 g
                    </p>
                    <p className="text-xs text-muted">
                      1 serving = {f.servingLabel} ({f.servingGrams} g)
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-quiet shrink-0 px-3"
                    onClick={() => setEditing(f)}
                  >
                    Edit
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
