import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Exercise" subtitle="Loading records">
      <SkeletonBlock className="h-40" />
      <SkeletonBlock className="h-44" />
      <SkeletonBlock className="h-64" />
    </PageSkeleton>
  );
}
