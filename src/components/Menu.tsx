'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * A dropdown that behaves like a dropdown.
 *
 * This replaces a bare <details> element. That version opened and closed on
 * its summary and nothing else: picking "Profile" navigated but left the panel
 * hanging open over the new page, so you had to tap the avatar a second time
 * to dismiss it. Clicking away or pressing Escape did nothing either.
 *
 * Three ways out, which is what people expect from a menu: choosing something
 * in it, clicking outside it, or pressing Escape.
 */
export function Menu({
  trigger,
  label,
  align = 'right',
  panelClassName = 'w-56',
  children,
}: {
  trigger: React.ReactNode;
  label: string;
  align?: 'left' | 'right';
  panelClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Navigating away closes it. Covers links inside the panel and the browser's
  // own back button, which would otherwise leave it open on the previous page.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute z-30 mt-2 overflow-hidden rounded-xl border border-line bg-card shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${panelClassName}`}
          // Any click inside dismisses it. A menu item's own job — navigating,
          // submitting — still happens; React has already dispatched the event
          // by the time this state change is applied.
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}
