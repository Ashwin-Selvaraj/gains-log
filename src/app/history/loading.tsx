import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="History" subtitle="Tap any day to fill it in or fix it.">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <SkeletonBlock key={i} className="h-16" />
      ))}
    </PageSkeleton>
  );
}
