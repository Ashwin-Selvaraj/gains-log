import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Goals" subtitle="What the report measures against">
      <SkeletonBlock className="h-72" />
    </PageSkeleton>
  );
}
