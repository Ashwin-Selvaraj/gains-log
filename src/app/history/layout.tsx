import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'History',
  description: 'Every day you have logged.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
