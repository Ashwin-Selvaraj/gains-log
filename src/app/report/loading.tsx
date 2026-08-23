import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Weekly Report" subtitle="Last 7 days">
      <SkeletonBlock className="h-44" />
      <SkeletonBlock className="h-48" />
      <SkeletonBlock className="h-64" />
    </PageSkeleton>
  );
}
