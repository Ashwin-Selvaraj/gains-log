import type { Metadata, Viewport } from 'next';
import { Anton } from 'next/font/google';
import './globals.css';

/**
 * Self-hosted at build time by next/font, so there is no request to Google on
 * load and no flash of fallback text. `display: swap` keeps the wordmark
 * readable in the fallback face while the real one arrives.
 */
const display = Anton({
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  variable: '--font-display',
});
import { TabBar } from '@/components/TabBar';
import { ServiceWorker } from '@/components/ServiceWorker';
import { SyncBanner } from '@/components/SyncBanner';
import { AppHeader } from '@/components/AppHeader';
import { auth } from '@/lib/auth';
import { Splash } from '@/components/Splash';

export const metadata: Metadata = {
  // The template gives every page its own tab title ("Report · Gains Log")
  // instead of five identical ones, which matters once tabs are open on a laptop.
  title: { default: 'GAINS LOG', template: '%s · GAINS LOG' },
  description: 'Daily tracker for a muscle-gain journey — habits, training, food and records.',
  applicationName: 'GAINS LOG',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'GAINS LOG', statusBarStyle: 'default' },
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
    <html lang="en" className={display.variable}>
      <body className="min-h-dvh antialiased">
        <Splash />
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
