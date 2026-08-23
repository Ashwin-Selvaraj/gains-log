import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Plan" subtitle="Your weekly split">
      <SkeletonBlock className="h-20" />
      <SkeletonBlock className="h-64" />
    </PageSkeleton>
  );
}
