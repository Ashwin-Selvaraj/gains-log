import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Goals',
  description: 'What the app measures against.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
