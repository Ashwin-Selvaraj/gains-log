'use client';

export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved';

type Props = {
  state: SaveState;
  onSave: () => void;
  /** Inline variant for an expanded day in History, which has no fixed footer. */
  inline?: boolean;
};

/**
 * Sits above the tab bar so it's in thumb reach, and only appears when there's
 * something to save. The confirmation lingers for a moment after saving —
 * without it, the bar would simply vanish and you'd be left wondering whether
 * the tap registered.
 */
export function SaveBar({ state, onSave, inline = false }: Props) {
  if (state === 'clean') return null;

  const body = (
    <div
      className={`mx-auto flex w-full max-w-2xl items-center gap-3 ${
        inline ? '' : 'px-4 py-3'
      }`}
    >
      <p
        className={`min-w-0 flex-1 text-sm ${
          state === 'saved' ? 'text-accent' : 'text-muted'
        }`}
        role="status"
      >
        {state === 'dirty' && 'Unsaved changes'}
        {state === 'saving' && 'Saving…'}
        {state === 'saved' && 'Saved ✓'}
      </p>

      {state !== 'saved' && (
        <button
          type="button"
          className="btn-primary shrink-0 px-6"
          onClick={onSave}
          disabled={state === 'saving'}
        >
          {state === 'saving' ? 'Saving…' : 'Save'}
        </button>
      )}
    </div>
  );

  if (inline) {
    return (
      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-card p-3">
        {body}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-x-0 z-40 border-t border-line bg-card/95 backdrop-blur"
      // Clears the tab bar (60px) plus whatever the device reserves below it.
      style={{ bottom: 'calc(60px + env(safe-area-inset-bottom))' }}
    >
      {body}
    </div>
  );
}
