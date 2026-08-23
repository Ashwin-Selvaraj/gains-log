'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Today', icon: '📋' },
  { href: '/meals', label: 'My Meals', icon: '🍽️' },
  { href: '/report', label: 'Report', icon: '📈' },
  { href: '/history', label: 'History', icon: '🗓️' },
];

/**
 * Sits inside <Link> so it can read that link's own navigation state. Without
 * this, tapping a tab whose route is still compiling (dev) or still fetching
 * (slow connection) leaves the old screen on display with no acknowledgement —
 * which reads as a dead button.
 */
function TabContent({
  icon,
  label,
  active,
}: {
  icon: string;
  label: string;
  active: boolean;
}) {
  const { pending } = useLinkStatus();

  return (
    <span
      className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5
                  text-xs font-medium transition
                  ${active || pending ? 'text-accent' : 'text-muted'}`}
    >
      <span aria-hidden className="relative text-xl leading-none">
        {icon}
        {pending && (
          <span className="absolute -right-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 animate-ping rounded-full bg-accent" />
        )}
      </span>
      {label}
    </span>
  );
}

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur
                 pb-[env(safe-area-inset-bottom)]"
      aria-label="Sections"
    >
      <ul className="mx-auto flex w-full max-w-2xl">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                prefetch
                aria-current={active ? 'page' : undefined}
                className="block active:scale-95 active:opacity-70 transition"
              >
                <TabContent icon={tab.icon} label={tab.label} active={active} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
