import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TabBar } from '@/components/TabBar';
import { ServiceWorker } from '@/components/ServiceWorker';
import { SyncBanner } from '@/components/SyncBanner';
import { AppHeader } from '@/components/AppHeader';
import { auth } from '@/lib/auth';

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Signed out, the app chrome is hidden: the tab bar would offer five
  // destinations that all bounce straight back to the sign-in screen, which
  // reads as the app being broken rather than as it asking you to sign in, and
  // the header wordmark would repeat the one on the sign-in card itself.
  const signedIn = Boolean((await auth())?.user);

  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <ServiceWorker />
        <SyncBanner />
        {signedIn && <AppHeader />}
        <main
          className={`mx-auto w-full max-w-2xl px-4 pt-2 ${signedIn ? 'pb-44' : 'pb-12'}`}
        >
          {children}
        </main>
        {signedIn && <TabBar />}
      </body>
    </html>
  );
}
