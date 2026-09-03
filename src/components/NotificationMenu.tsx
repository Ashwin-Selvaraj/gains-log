'use client';

import { Menu } from '@/components/Menu';
import { ReminderToggle } from '@/components/ReminderToggle';

/**
 * Notification settings, in the header beside the account menu.
 *
 * They used to be a card at the bottom of Today — below the meals, the photos
 * and everything else — which put a setting you touch once in the middle of a
 * screen you use every day. Settings belong in chrome, not in the log.
 */
export function NotificationMenu() {
  return (
    <Menu
      label="Notifications"
      // Wide enough for time fields and labels, so it spans the viewport
      // rather than hanging off a button at the right edge.
      variant="sheet"
      // A panel to work in, not a list to pick from: touching a time field
      // must not dismiss it.
      closeOnSelect={false}
      trigger={
        <span className="flex h-8 w-8 items-center justify-center rounded-full text-muted ring-1 ring-line transition-colors hover:text-ink">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M12 22a2.2 2.2 0 0 0 2.2-2.2H9.8A2.2 2.2 0 0 0 12 22Zm6.5-5.3v-5a6.6 6.6 0 0 0-5-6.4V4.5a1.5 1.5 0 1 0-3 0v.8a6.6 6.6 0 0 0-5 6.4v5L3.7 18v.9h16.6V18l-1.8-1.3Z" />
          </svg>
        </span>
      }
    >
      <p className="border-b border-line px-3 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted">
        Notifications
      </p>
      <ReminderToggle chrome="plain" />
    </Menu>
  );
}
