import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Exercises" subtitle="Your lifts and their records">
      <SkeletonBlock className="h-64" />
    </PageSkeleton>
  );
}
