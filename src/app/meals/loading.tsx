import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Foods" subtitle="Your saved combos and food table.">
      <SkeletonBlock className="h-44" />
      <SkeletonBlock className="h-56" />
    </PageSkeleton>
  );
}
