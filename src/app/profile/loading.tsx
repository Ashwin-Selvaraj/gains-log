import { SkeletonBlock } from '@/components/Skeleton';

/** Mirrors the real layout: avatar row, then the stacked cards. */
export default function Loading() {
  return (
    <div className="space-y-4 pt-1" aria-hidden>
      <div className="flex items-center gap-3.5">
        <SkeletonBlock className="h-14 w-14 rounded-full" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-5 w-40" />
          <SkeletonBlock className="h-4 w-52" />
        </div>
      </div>
      <SkeletonBlock className="h-36" />
      <SkeletonBlock className="h-64" />
      <SkeletonBlock className="h-72" />
      <SkeletonBlock className="h-52" />
    </div>
  );
}
