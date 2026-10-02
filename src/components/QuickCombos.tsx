'use client';

import { useEffect, useRef, useState } from 'react';
import { MEAL_SLOTS } from '@/lib/goals';
import type { Meal, Preset } from '@/lib/types';

const slotDef = (key: string) => MEAL_SLOTS.find((s) => s.key === key) ?? MEAL_SLOTS[2];

/**
 * "Your usual": saved combos as the first thing in the food section.
 *
 * Most days, most meals are a repeat — the same breakfast, the same shake.
 * Those should cost one tap, and they used to cost several: the combos were
 * small chips under the meal list and the slot picker, and they landed in
 * whichever slot happened to be selected, so the breakfast combo tapped at
 * 1pm was filed as lunch.
 *
 * Now each combo goes to the slot it's usually eaten in (learned from the
 * log), the ones that fit the time of day come first, a tap confirms with an
 * Undo, and a combo already eaten today needs a second deliberate tap — one
 * stray touch shouldn't double a day's breakfast.
 */
export function QuickCombos({
  combos,
  meals,
  clockSlot,
  onAdd,
  onRemove,
}: {
  combos: Preset[];
  meals: Meal[];
  clockSlot: string;
  onAdd: (payload: Record<string, unknown>, optimistic: Omit<Meal, 'id'>) => Promise<string | null>;
  onRemove: (id: string) => void;
}) {
  const [undo, setUndo] = useState<{ comboId: string; mealId: string | null; slot: string } | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const timers = useRef<{ undo?: ReturnType<typeof setTimeout>; armed?: ReturnType<typeof setTimeout> }>({});

  useEffect(() => {
    const t = timers.current;
    return () => {
      clearTimeout(t.undo);
      clearTimeout(t.armed);
    };
  }, []);

  if (combos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-3 py-2.5 text-xs text-muted">
        <span aria-hidden className="mr-1">⭐</span>
        Eat the same thing often? Log the foods once, then tap{' '}
        <strong className="font-semibold text-ink">Save as combo</strong> on that meal — next time
        it&apos;s one tap, right here.
      </div>
    );
  }

  const slotOf = (c: Preset) => c.usualSlot ?? clockSlot;
  const loggedToday = (c: Preset) => meals.some((m) => m.source === 'preset' && m.name === c.name);

  // What fits right now first; then the ones eaten most; then alphabetical.
  const sorted = [...combos].sort(
    (a, b) =>
      Number(slotOf(b) === clockSlot) - Number(slotOf(a) === clockSlot) ||
      (b.timesLogged ?? 0) - (a.timesLogged ?? 0) ||
      a.name.localeCompare(b.name),
  );

  async function log(c: Preset) {
    const slot = slotOf(c);
    setArmed(null);
    clearTimeout(timers.current.undo);
    setUndo({ comboId: c.id, mealId: null, slot });
    const mealId = await onAdd(
      { presetId: c.id, slot },
      {
        name: c.name,
        calories: c.macros.kcal,
        protein: c.macros.protein,
        carbs: c.macros.carbs,
        fat: c.macros.fat,
        fiber: c.macros.fiber,
        source: 'preset',
        photoUrl: null,
      },
    );
    setUndo((u) => (u && u.comboId === c.id ? { ...u, mealId } : u));
    timers.current.undo = setTimeout(() => setUndo(null), 6000);
  }

  function tap(c: Preset) {
    if (loggedToday(c) && armed !== c.id) {
      setArmed(c.id);
      clearTimeout(timers.current.armed);
      timers.current.armed = setTimeout(() => setArmed(null), 3000);
      return;
    }
    void log(c);
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="label mb-0">Your usual</p>
        <p className="text-[11px] text-muted">one tap logs it</p>
      </div>
      {/* Full-width rows, not a two-column grid: the name is how you
          recognise a combo, and two columns truncated "Oats & whey bowl"
          to "Oats & whe…". */}
      <div className="space-y-1.5">
        {sorted.map((c) => {
          const slot = slotDef(slotOf(c));
          const done = loggedToday(c);
          const isArmed = armed === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => tap(c)}
              aria-label={`Log ${c.name} as ${slot.label.toLowerCase()}`}
              className={`flex min-h-[56px] w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition active:scale-[0.98] ${
                isArmed
                  ? 'border-amber-500/60 bg-amber-500/10'
                  : done
                    ? 'border-accent/40 bg-accent/5'
                    : 'border-line bg-surface'
              }`}
            >
              <span aria-hidden className="text-xl">
                {slot.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-snug">{c.name}</span>
                <span className="block text-[11px] tabular-nums text-muted">
                  {isArmed
                    ? 'Already logged today — tap again to add another'
                    : `${slot.label} · ${Math.round(c.macros.kcal)} kcal · ${Math.round(c.macros.protein)}g protein`}
                </span>
              </span>
              <span
                aria-hidden
                className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2 text-sm font-bold ${
                  done && !isArmed ? 'bg-accent/15 text-accent' : 'bg-accent text-white'
                }`}
              >
                {done && !isArmed ? '✓' : '+'}
              </span>
            </button>
          );
        })}
      </div>

      {undo && (
        <div
          role="status"
          className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-ink px-3 py-2 text-xs text-card"
        >
          <span className="truncate">
            ✓ {combos.find((c) => c.id === undo.comboId)?.name ?? 'Combo'} logged to{' '}
            {slotDef(undo.slot).label.toLowerCase()}
          </span>
          <button
            type="button"
            className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-50"
            disabled={!undo.mealId}
            onClick={() => {
              if (undo.mealId) onRemove(undo.mealId);
              setUndo(null);
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * "Save as combo" for one meal slot — turns what you just logged into a
 * one-tap combo, instead of rebuilding it food by food on the Foods tab.
 */
export function SaveAsCombo({
  slotKey,
  meals,
  combos,
  onSaved,
}: {
  slotKey: string;
  meals: Meal[];
  combos: Preset[];
  onSaved: (combo: Preset) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`My ${slotDef(slotKey).label.toLowerCase()}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only foods from the table can make a combo — a typed or photo meal has no
  // food rows behind it to rebuild from.
  const items = meals
    .filter((m) => m.source === 'food' && m.foodId && m.grams)
    .map((m) => ({ foodId: m.foodId!, grams: m.grams! }));
  if (items.length === 0) return null;

  // Already a combo with exactly these foods: nothing to save.
  const signature = (list: { foodId: string; grams: number }[]) =>
    list
      .map((i) => `${i.foodId}:${Math.round(i.grams)}`)
      .sort()
      .join('|');
  if (combos.some((c) => signature(c.items) === signature(items))) return null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || `My ${slotKey}`, items }),
      });
      if (!res.ok) throw new Error();
      const combo = (await res.json()) as Preset;
      onSaved({ ...combo, usualSlot: slotKey, timesLogged: 0 });
      setOpen(false);
    } catch {
      setError('Could not save that combo.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-accent"
      >
        ⭐ Save as combo
      </button>
    );
  }

  return (
    <div className="mt-2 flex w-full items-center gap-2">
      <input
        className="field py-2 text-sm"
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label="Combo name"
        autoFocus
        maxLength={60}
      />
      <button type="button" className="btn-primary shrink-0 px-3 text-sm" disabled={busy} onClick={() => void save()}>
        {busy ? '…' : 'Save'}
      </button>
      <button type="button" className="shrink-0 text-sm text-muted" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
