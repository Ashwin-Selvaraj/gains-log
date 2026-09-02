import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Exercises',
  description: 'Records and history for every lift.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
