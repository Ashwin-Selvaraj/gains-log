import { PageSkeleton, TodaySkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Today">
      <TodaySkeleton />
    </PageSkeleton>
  );
}
