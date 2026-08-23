import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="My Meals" subtitle="Your regulars.">
      <SkeletonBlock className="h-44" />
      <SkeletonBlock className="h-56" />
    </PageSkeleton>
  );
}
