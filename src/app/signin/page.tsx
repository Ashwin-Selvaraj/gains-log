import { redirect } from 'next/navigation';
import { auth, signIn } from '@/lib/auth';

export const metadata = { title: 'Sign in' };

/**
 * Full-bleed and fixed to the viewport.
 *
 * It was previously a min-height block inside the app's normal padded column,
 * which on a phone left it sitting above centre with the page still scrollable
 * behind it. Anchoring to the viewport with `fixed inset-0` makes centring
 * exact at any height and removes the scroll outright — there is nothing below
 * the fold to reach, so being able to drag the screen only felt broken.
 *
 * The page paints its own dark ground rather than inheriting the theme: the
 * artwork is dark, and a light-mode surface behind it would show as a pale
 * border at the edges.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect('/');

  const { error, callbackUrl } = await searchParams;

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-black">
      {/* A single panel cropped from the poster, deliberately soft: it is
          backdrop, not subject, and the blur also hides that the source panel
          is only ~314px wide. eslint-disable because next/image's client
          wrapper and srcset buy nothing for one fixed full-bleed asset. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/signin-bg.webp"
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-[0.55] blur-[1.5px]"
      />
      {/* Two passes: a vertical wash so the text sits on near-black at top and
          bottom, and a radial vignette that pulls the eye to the middle. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/25 to-black/90" />
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(115% 60% at 50% 44%, transparent 0%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      {/* h-dvh, not h-screen: on iOS Safari the dynamic unit accounts for the
          address bar, so "centred" stays centred as it collapses. */}
      <div className="relative flex h-dvh flex-col items-center justify-center px-7">
        <div className="w-full max-w-[22rem]">
          <div className="flex flex-col items-center text-center">
            <svg viewBox="0 0 512 512" className="h-14 w-14 shrink-0" aria-hidden>
              <rect width="512" height="512" rx="112" fill="#0b0b0d" />
              <rect
                width="512"
                height="512"
                rx="112"
                fill="none"
                stroke="rgb(var(--ember))"
                strokeOpacity="0.35"
                strokeWidth="10"
              />
              <g stroke="rgb(var(--ember))" strokeLinecap="round" fill="none">
                <line x1="168" y1="344" x2="344" y2="168" strokeWidth="34" />
                <line x1="120" y1="316" x2="196" y2="392" strokeWidth="40" />
                <line x1="316" y1="120" x2="392" y2="196" strokeWidth="40" />
              </g>
            </svg>

            <h1 className="mt-5 text-[2rem] font-black uppercase leading-none tracking-[0.15em] text-white">
              Gains Log
            </h1>

            <div
              className="mt-4 h-px w-20"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgb(var(--ember)), transparent)',
              }}
            />

            <p className="mt-4 text-[0.68rem] font-semibold uppercase tracking-[0.3em] text-white/45">
              Stronger than yesterday
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-7 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2.5 text-center text-sm text-amber-200"
            >
              {error === 'AccessDenied'
                ? 'That account isn’t on the invite list. Ask Ashwin to add your email, then try again.'
                : 'Sign-in didn’t complete. Try once more.'}
            </p>
          )}

          <form
            className="mt-9"
            action={async () => {
              'use server';
              await signIn('google', { redirectTo: callbackUrl || '/' });
            }}
          >
            <button
              type="submit"
              className="btn w-full gap-3 rounded-2xl bg-white py-3.5 font-semibold text-neutral-900 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.9)] transition hover:bg-white/92"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
                <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.4a5.5 5.5 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.6-5.2 3.6-8.8Z" />
                <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24Z" />
                <path fill="#FBBC05" d="M5.3 14.3a7.1 7.1 0 0 1 0-4.6v-3.1h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
                <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z" />
              </svg>
              Continue with Google
            </button>
          </form>

          {/* Was one grey sentence. As two badges the same two facts read as
              assurances rather than fine print, which is what they are. */}
          <div className="mt-7 flex items-center justify-center gap-2.5">
            <Badge
              label="Invite only"
              path="M12 2 4 5v6c0 4.4 3.1 8.5 8 10 4.9-1.5 8-5.6 8-10V5l-8-3Z"
            />
            <Badge
              label="Private to you"
              path="M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9h-2Zm-8 0V7a3 3 0 1 1 6 0v2H9Z"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ label, path }: { label: string; path: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.12em] text-white/55 backdrop-blur-sm">
      <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="currentColor" aria-hidden>
        <path d={path} />
      </svg>
      {label}
    </span>
  );
}
