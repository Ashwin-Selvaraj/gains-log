/**
 * Shared placeholder blocks. Used both by `loading.tsx` (shown the instant a tab
 * is tapped, before the route's code has even arrived) and by the pages
 * themselves while their first fetch is in flight — so the two states look like
 * one continuous load rather than two different screens.
 */

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-line/60 ${className}`} />;
}

export function PageSkeleton({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted">{subtitle ?? ' '}</p>
      </header>
      <div className="space-y-4" aria-hidden>
        {children}
      </div>
    </>
  );
}

/**
 * Mirrors the section layout the screen actually renders.
 *
 * It used to draw the old design — a 2x2 grid of habit stamps then three
 * blocks — so every load flashed the previous layout before settling into the
 * new one, which reads as the app changing its mind. A skeleton is a promise
 * about what is coming; when it doesn't match, it is worse than no skeleton.
 */
export function TodaySkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {/* Training, Fuel, Body — open sections, tallest first. */}
      <SkeletonBlock className="h-64" />
      <SkeletonBlock className="h-56" />
      <SkeletonBlock className="h-72" />
      {/* Learning */}
      <SkeletonBlock className="h-32" />
      {/* Meetings and Photos, collapsed to a header row each. */}
      <SkeletonBlock className="h-14" />
      <SkeletonBlock className="h-14" />
    </div>
  );
}
