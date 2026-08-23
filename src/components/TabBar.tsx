'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/', label: 'Today', icon: '📋' },
  { href: '/meals', label: 'My Meals', icon: '🍽️' },
  { href: '/report', label: 'Report', icon: '📈' },
  { href: '/history', label: 'History', icon: '🗓️' },
];

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
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5
                            text-xs font-medium transition
                            ${active ? 'text-accent' : 'text-muted'}`}
              >
                <span aria-hidden className="text-xl leading-none">
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
