'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';

/**
 * Pins the page in place while a sheet is open.
 *
 * `overflow: hidden` on <body> is what most code reaches for, and iOS Safari
 * ignores it for touch scrolling — the page behind kept moving while you
 * scrolled the notification settings. Fixing the body at its current offset
 * works everywhere; the offset is restored on close so the page doesn't jump
 * back to the top.
 */
function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const y = window.scrollY;
    const body = document.body.style;
    const prev = { position: body.position, top: body.top, width: body.width, overflow: body.overflow };
    body.position = 'fixed';
    body.top = `-${y}px`;
    body.width = '100%';
    body.overflow = 'hidden';
    return () => {
      Object.assign(body, prev);
      window.scrollTo(0, y);
    };
  }, [locked]);
}

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
  variant = 'anchored',
  closeOnSelect = true,
  children,
}: {
  trigger: React.ReactNode;
  label: string;
  align?: 'left' | 'right';
  panelClassName?: string;
  /**
   * 'anchored' hangs the panel off the trigger, which is right for a short
   * list of items. 'sheet' is a panel across the viewport below the header,
   * over a blurred, scroll-locked page: a panel wide enough to hold time
   * fields does not fit beside a button near the right edge of a phone, and a
   * panel you scroll inside must not scroll the page under it.
   */
  variant?: 'anchored' | 'sheet';
  /**
   * False for panels you *work inside* rather than pick from. A list of menu
   * items should close the moment one is chosen; a panel with time fields and
   * toggles must not vanish the instant you touch one — which is what happened
   * to the notification settings, making the time impossible to change.
   */
  closeOnSelect?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const sheet = variant === 'sheet';

  // Navigating away closes it. Covers links inside the panel and the browser's
  // own back button, which would otherwise leave it open on the previous page.
  useEffect(() => setOpen(false), [pathname]);

  useScrollLock(open && sheet);

  useEffect(() => {
    if (!open) return;

    // The sheet lives in a portal, outside `ref`, so "inside" means either.
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
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

  // A menu item's own job — navigating, submitting — still happens; React has
  // already dispatched the event by the time this state change is applied.
  // Panels opt out entirely (see closeOnSelect).
  const onPanelClick = closeOnSelect ? () => setOpen(false) : undefined;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup={sheet ? 'dialog' : 'menu'}
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>

      {open && !sheet && (
        <div
          role="menu"
          ref={panelRef}
          className={`absolute z-30 mt-2 overflow-hidden rounded-xl border border-line bg-card shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${panelClassName}`}
          onClick={onPanelClick}
        >
          {children}
        </div>
      )}

      {open &&
        sheet &&
        createPortal(
          // Portalled so it sits above everything, the tab bar included,
          // rather than inside the header's stacking context.
          <div className="fixed inset-0 z-50">
            <div
              aria-hidden
              className="absolute inset-0 animate-[fadeIn_150ms_ease-out] bg-black/30 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={label}
              ref={panelRef}
              className="absolute inset-x-3 top-[4.5rem] mx-auto max-h-[calc(100dvh-6rem)] max-w-2xl overflow-y-auto overscroll-contain rounded-2xl border border-line bg-card shadow-2xl"
              onClick={onPanelClick}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card px-3 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-ink"
                  aria-label={`Close ${label.toLowerCase()}`}
                  onClick={() => setOpen(false)}
                >
                  ✕
                </button>
              </div>
              {children}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
