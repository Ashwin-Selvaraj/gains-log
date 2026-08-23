'use client';

type Props = {
  label: string;
  icon: string;
  checked: boolean;
  onToggle: () => void;
};

/**
 * Deliberately not a checkbox: it's a big thumb target that fills in and grows a
 * checkmark badge when stamped. Modest — one 220ms animation, no confetti.
 */
export function StampButton({ label, icon, checked, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={checked}
      className={`relative flex min-h-[92px] flex-col items-center justify-center gap-1.5
                  rounded-2xl border-2 px-2 transition active:scale-[0.97]
                  ${
                    checked
                      ? 'border-accent bg-accent/10 text-ink'
                      : 'border-line bg-card text-muted'
                  }`}
    >
      <span aria-hidden className={`text-2xl ${checked ? '' : 'opacity-50 grayscale'}`}>
        {icon}
      </span>
      <span className="text-sm font-medium">{label}</span>

      {checked && (
        <span
          aria-hidden
          className="stamp-check absolute right-2 top-2 flex h-6 w-6 items-center justify-center
                     rounded-full bg-accent text-[13px] font-bold leading-none text-white"
        >
          ✓
        </span>
      )}
    </button>
  );
}
