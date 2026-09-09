'use client';

import { useEffect, useRef, useState } from 'react';
import { MUSCLE_GROUPS, muscleGroupLabel } from '@/lib/exercises';

type LibraryEntry = {
  id: string;
  name: string;
  nameKey: string;
  muscleGroup: string;
  custom: boolean;
};

/**
 * Search-and-pick for logging an exercise, replacing a free-text box with a
 * `<datalist>` of whatever had already been logged that day.
 *
 * That old input is why PR histories fragmented: nothing offered the canonical
 * spelling, so "Bench press", "bench press" and "Benchpress" all got logged and
 * each accumulated its own records. Picking from a catalogue makes the common
 * case exact; typing something genuinely new is still possible, but it asks
 * first and files it under a muscle group so the next person to type it gets
 * the match instead of making a fourth spelling.
 */
export function ExercisePicker({
  onPick,
  onCancel,
  /** Pre-filters the list, used by the "doing chest today instead" flow. */
  muscle,
}: {
  onPick: (name: string) => void;
  onCancel: () => void;
  muscle?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LibraryEntry[]>([]);
  const [exactMatch, setExactMatch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newGroup, setNewGroup] = useState<string>(muscle ?? 'chest');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced so a fast typist doesn't fire a request per keystroke; 180ms is
  // below the threshold where the list feels like it lags the typing.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (muscle) params.set('muscle', muscle);

      fetch(`/api/exercise-library?${params}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
        .then((data: { exercises: LibraryEntry[]; exactMatch: boolean }) => {
          if (cancelled) return;
          setResults(data.exercises);
          setExactMatch(data.exactMatch);
        })
        .catch(() => !cancelled && setError('Could not load exercises.'))
        .finally(() => !cancelled && setLoading(false));
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, muscle]);

  const typed = query.trim();
  /**
   * Only offered when the catalogue returns *nothing*.
   *
   * Gating on "no exact match" alone was wrong: typing "incl" showed three
   * real matches and, underneath them, an invitation to create an exercise
   * literally called "incl". That is the duplicate factory this whole feature
   * exists to shut down — one fast tap and the catalogue has junk in it. If
   * anything matches, pick from it; type the full name to get this option.
   */
  const canAdd = typed.length > 1 && !exactMatch && !loading && results.length === 0;

  async function addNew() {
    setAdding(true);
    setError(null);
    try {
      const res = await fetch('/api/exercise-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: typed, muscleGroup: newGroup }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Could not add that.');
      onPick(json.name as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-line bg-surface p-3">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          className="field"
          placeholder="Search exercises…"
          aria-label="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="btn-quiet shrink-0 px-3" onClick={onCancel}>
          Cancel
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {results.length > 0 && (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {results.map((ex) => (
            <li key={ex.id}>
              <button
                type="button"
                onClick={() => onPick(ex.name)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left transition-colors active:bg-line/50"
              >
                <span className="min-w-0 truncate text-sm font-medium">{ex.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {ex.custom && <span className="mr-1">yours ·</span>}
                  {muscleGroupLabel(ex.muscleGroup)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && results.length === 0 && typed && (
        <p className="px-1 text-sm text-muted">Nothing in the catalogue matches that.</p>
      )}

      {/* The "add it anyway" path. Asking for a muscle group is what stops the
          catalogue turning into a flat list of one-off spellings — and it's
          what makes the new exercise show up under the right group later. */}
      {canAdd && (
        <div className="space-y-2 border-t border-line pt-2">
          <p className="text-sm">
            Add <strong>{typed}</strong> as a new exercise?
          </p>
          <div className="flex gap-2">
            <select
              className="field"
              aria-label="Muscle group for the new exercise"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
            >
              {MUSCLE_GROUPS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn-primary shrink-0"
              onClick={() => void addNew()}
              disabled={adding}
            >
              {adding ? 'Adding…' : 'Add & log'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
