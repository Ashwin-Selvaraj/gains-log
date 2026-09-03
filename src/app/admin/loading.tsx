import { PageSkeleton, SkeletonBlock } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Manage access" subtitle="Who can sign in">
      <SkeletonBlock className="h-32" />
      <SkeletonBlock className="h-64" />
    </PageSkeleton>
  );
}
