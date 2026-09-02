import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Meals',
  description: 'Your regular combinations and the food table.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
