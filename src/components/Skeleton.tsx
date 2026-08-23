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

export function TodaySkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonBlock key={i} className="h-[92px]" />
        ))}
      </div>
      <SkeletonBlock className="h-24" />
      <SkeletonBlock className="h-56" />
      <SkeletonBlock className="h-32" />
    </div>
  );
}
