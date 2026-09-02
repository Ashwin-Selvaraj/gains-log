import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Report',
  description: 'This week in numbers.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
