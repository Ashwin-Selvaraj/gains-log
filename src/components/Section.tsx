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
/** The five tones defined in globals.css, one per section of Today. */
export type SectionTone =
  | 'training'
  | 'fuel'
  | 'body'
  | 'learning'
  | 'practices';

export function Section({
  title,
  icon,
  tone,
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
  /**
   * Colours the icon tile and the hairline under the header. Omitted for the
   * two occasional sections (Meetings, Photos), which stay neutral on purpose
   * — giving everything a colour would leave nothing distinguished by it.
   */
  tone?: SectionTone;
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

  // Read once into a local so the tile, the rule and the summary all reference
  // the same channel triple rather than three near-identical inline strings.
  const rgb = tone ? `var(--tone-${tone})` : null;

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
            <span
              aria-hidden
              // A tinted tile rather than a bare emoji: it gives the colour
              // enough area to register at a glance while scrolling, which a
              // single glyph never does.
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
              style={
                rgb
                  ? { backgroundColor: `rgb(${rgb} / 0.14)` }
                  : { backgroundColor: 'rgb(var(--line) / 0.6)' }
              }
            >
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

      {/* The divider carries the tone too — a hairline is enough to tie the
          body of the section back to its header without tinting the content. */}
      {isOpen && (
        <div
          className="space-y-3 border-t px-4 py-4"
          style={{
            borderTopColor: rgb ? `rgb(${rgb} / 0.22)` : 'rgb(var(--line))',
          }}
        >
          {children}
        </div>
      )}
    </section>
  );
}
