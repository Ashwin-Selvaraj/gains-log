'use client';

import { useEffect, useState } from 'react';
import { mutate, OfflineQueuedError } from '@/lib/sync';
import type { Preset } from '@/lib/types';

export default function MealsPage() {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [name, setName] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/presets')
      .then((r) => r.json() as Promise<Preset[]>)
      .then(setPresets)
      .catch(() => setPresets([]));
  }, []);

  function clearForm() {
    setName('');
    setCalories('');
    setProtein('');
    setEditing(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const payload = {
      name: name.trim(),
      calories: calories === '' ? null : Number(calories),
      protein: protein === '' ? null : Number(protein),
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
    } catch (err) {
      if (err instanceof OfflineQueuedError) clearForm();
    }
  }

  async function remove(id: string) {
    setPresets((prev) => prev!.filter((p) => p.id !== id));
    if (editing === id) clearForm();
    await mutate(`/api/presets/${id}`, 'DELETE').catch(() => {});
  }

  return (
    <>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">My Meals</h1>
        <p className="text-sm text-muted">
          Your regulars. Saved here, they&apos;re one tap on the Today screen.
        </p>
      </header>

      <form onSubmit={save} className="card mb-4 space-y-2">
        <input
          className="field"
          placeholder="oats + 3 bananas + whey"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Preset name"
        />
        <div className="flex gap-2">
          <input
            className="field"
            inputMode="numeric"
            placeholder="kcal"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            aria-label="Calories"
          />
          <input
            className="field"
            inputMode="numeric"
            placeholder="protein g"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            aria-label="Protein in grams"
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn-primary flex-1" disabled={!name.trim()}>
            {editing ? 'Save changes' : 'Add preset'}
          </button>
          {editing && (
            <button type="button" className="btn-quiet" onClick={clearForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {presets === null && <div className="h-24 animate-pulse rounded-2xl bg-line/60" />}

      {presets?.length === 0 && (
        <p className="card text-sm text-muted">
          No presets yet. Add the meals you eat most — breakfast is usually the same
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
                  {p.calories ?? '—'} kcal · {p.protein ?? '—'}g protein
                </p>
              </div>
              <button
                type="button"
                className="btn-quiet px-3"
                onClick={() => {
                  setEditing(p.id);
                  setName(p.name);
                  setCalories(p.calories === null ? '' : String(p.calories));
                  setProtein(p.protein === null ? '' : String(p.protein));
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
