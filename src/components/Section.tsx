'use client';

import { useState } from 'react';

/**
 * One block of the Today screen.
 *
 * Today used to be eight cards of equal weight in a flat column — habits, then
 * the workout, then targets, then a card holding weight and two unrelated
 * notes, then recovery, then meetings, meals and photos. Nothing indicated
 * which of them mattered, and things that belonged together sat apart: the
 * Workout tick was three cards above the sets it referred to, and the calorie
 * targets were nowhere near the meals that move them.
 *
 * A section groups a habit with the thing it describes, carries its own
 * summary so its state is legible while collapsed, and can fold away when it
 * is not part of most days.
 */
export function Section({
  title,
  icon,
  summary,
  done,
  onToggleDone,
  doneLabel,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon?: string;
  /** Shown on the right of the header — the state you'd want without opening it. */
  summary?: React.ReactNode;
  /** When provided, the header carries this section's habit tick. */
  done?: boolean;
  onToggleDone?: () => void;
  doneLabel?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = collapsible ? open : true;

  const Heading = collapsible ? 'button' : 'div';

  return (
    <section className="card p-0">
      <div className="flex items-center gap-2 px-4 py-3">
        <Heading
          {...(collapsible
            ? {
                type: 'button' as const,
                onClick: () => setOpen((v) => !v),
                'aria-expanded': open,
              }
            : {})}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {icon && (
            <span aria-hidden className="text-base">
              {icon}
            </span>
          )}
          <h2 className="truncate text-base font-semibold">{title}</h2>
          {collapsible && (
            <span
              aria-hidden
              className={`text-xs text-muted transition-transform ${open ? 'rotate-90' : ''}`}
            >
              ›
            </span>
          )}
        </Heading>

        {summary && <div className="shrink-0 text-xs text-muted">{summary}</div>}

        {onToggleDone && (
          <button
            type="button"
            aria-pressed={done}
            aria-label={doneLabel ?? `Mark ${title} done`}
            onClick={onToggleDone}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm transition active:scale-95 ${
              done
                ? 'border-accent bg-accent text-white'
                : 'border-line bg-surface text-muted'
            }`}
          >
            <span aria-hidden>{done ? '✓' : ''}</span>
          </button>
        )}
      </div>

      {isOpen && <div className="space-y-3 border-t border-line px-4 py-4">{children}</div>}
    </section>
  );
}
