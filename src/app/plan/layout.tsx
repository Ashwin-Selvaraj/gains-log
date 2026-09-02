import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Plan',
  description: 'Your weekly training split.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
