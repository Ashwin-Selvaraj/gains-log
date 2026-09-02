import Link from 'next/link';

/**
 * The wordmark, shown once at the top of every screen. Each page still has its
 * own <h1>; this is the app's identity above them, so the product has a name on
 * screen rather than only on the home-screen icon.
 */
export function AppHeader() {
  return (
    <header className="mx-auto w-full max-w-2xl px-4 pt-5">
      <Link href="/" className="inline-flex items-center gap-2" aria-label="Gains Log — Today">
        <svg
          viewBox="0 0 512 512"
          className="h-6 w-6 shrink-0"
          aria-hidden
          role="presentation"
        >
          <rect width="512" height="512" rx="112" fill="rgb(var(--ink))" />
          <g stroke="rgb(var(--accent))" strokeLinecap="round" fill="none">
            <line x1="168" y1="344" x2="344" y2="168" strokeWidth="34" />
            <line x1="120" y1="316" x2="196" y2="392" strokeWidth="40" />
            <line x1="316" y1="120" x2="392" y2="196" strokeWidth="40" />
          </g>
        </svg>
        <span className="text-sm font-semibold tracking-tight text-muted">Gains Log</span>
      </Link>
    </header>
  );
}
