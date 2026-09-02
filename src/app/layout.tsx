import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TabBar } from '@/components/TabBar';
import { ServiceWorker } from '@/components/ServiceWorker';
import { SyncBanner } from '@/components/SyncBanner';
import { AppHeader } from '@/components/AppHeader';

export const metadata: Metadata = {
  // The template gives every page its own tab title ("Report · Gains Log")
  // instead of five identical ones, which matters once tabs are open on a laptop.
  title: { default: 'Gains Log', template: '%s · Gains Log' },
  description: 'Daily tracker for a muscle-gain journey — habits, training, food and records.',
  applicationName: 'Gains Log',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Gains Log', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Standalone PWAs shouldn't rubber-band or zoom on double tap.
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafaf9' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0e' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <ServiceWorker />
        <SyncBanner />
        <AppHeader />
        <main className="mx-auto w-full max-w-2xl px-4 pb-44 pt-2">{children}</main>
        <TabBar />
      </body>
    </html>
  );
}
