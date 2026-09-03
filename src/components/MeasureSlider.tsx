'use client';

/**
 * A habit with an amount, not just a tick.
 *
 * Water and sleep were stamps: tapping Water recorded "drank water today",
 * which is true of every day anyone has ever lived and so measured nothing.
 * A slider is the right control for these two because the value is a rough
 * quantity you already know ("about two and a half litres") rather than a
 * figure you look up — dragging is quicker than typing, and the target marker
 * gives the number a meaning without needing a second line of text.
 *
 * The number field stays available beside it: a slider is fast but imprecise,
 * and someone who tracks intake exactly should not be forced to nudge a thumb.
 */
export function MeasureSlider({
  icon,
  label,
  value,
  unit,
  max,
  step,
  target,
  onChange,
}: {
  icon: string;
  label: string;
  value: number | null;
  unit: string;
  max: number;
  step: number;
  /** Marked on the track, and the point at which the fill reads as "met". */
  target?: number;
  onChange: (value: number | null) => void;
}) {
  const current = value ?? 0;
  const pct = Math.min(100, (current / max) * 100);
  const met = target != null && current >= target;

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <span aria-hidden>{icon}</span>
          {label}
        </span>
        <span className="tabular-nums text-sm text-muted">
          <b
            className={`text-lg font-semibold ${met ? 'text-accent' : 'text-ink'}`}
          >
            {value == null ? '—' : current % 1 === 0 ? current : current.toFixed(2).replace(/0$/, '')}
          </b>{' '}
          {unit}
          {target != null && (
            <span className="ml-1 text-xs text-muted">/ {target}</span>
          )}
        </span>
      </div>

      <div className="relative">
        {/* The filled track is a separate element behind the input rather than
            an accent-color on the range itself, so the "target met" colour
            change works identically across browsers. */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-line">
          <div
            className={`h-full rounded-full transition-[width] ${met ? 'bg-accent' : 'bg-ink/35'}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        {target != null && target < max && (
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-3 w-px -translate-y-1/2 bg-ink/30"
            style={{ left: `${(target / max) * 100}%` }}
          />
        )}

        <input
          type="range"
          className="measure-range relative w-full"
          min={0}
          max={max}
          step={step}
          value={current}
          aria-label={`${label} in ${unit}`}
          onChange={(e) => {
            const next = Number(e.target.value);
            // Zero means "none recorded" rather than "recorded a zero", so it
            // clears the field — otherwise dragging back to the left would
            // leave a 0 that counts as having logged the day.
            onChange(next === 0 ? null : next);
          }}
        />
      </div>
    </div>
  );
}
