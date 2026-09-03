import { BackgroundArt, Wordmark } from '@/components/Wordmark';

/**
 * The cold-start screen.
 *
 * Server-rendered and animated entirely in CSS, so it is part of the very first
 * frame rather than something that appears once JavaScript has parsed — which
 * on a phone opening a cold PWA is precisely the gap it exists to cover. It
 * fades itself out and ends at visibility:hidden, so nothing underneath is ever
 * blocked and no client state has to track it.
 */
export function Splash() {
  return (
    <div aria-hidden className="splash fixed inset-0 z-[60] overflow-hidden bg-black">
      <BackgroundArt className="absolute inset-0 h-full w-full scale-105 object-cover opacity-90" />
      {/* Light at the top where the artwork's subject is, heavy at the bottom
          where the wordmark sits. */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black" />

      <div className="absolute inset-x-0 bottom-[12%] flex flex-col items-center px-8">
        <h1
          className="splash-item text-center text-[2.6rem] text-white"
          style={{ animationDelay: '120ms' }}
        >
          <Wordmark tracking="0.1em" />
        </h1>
        <div
          className="splash-item mt-4 h-px w-24"
          style={{
            animationDelay: '260ms',
            background:
              'linear-gradient(90deg, transparent, rgb(var(--ember)), transparent)',
          }}
        />
        <p
          className="splash-item mt-4 text-center text-[0.65rem] font-semibold uppercase tracking-[0.34em] text-white/55"
          style={{ animationDelay: '380ms' }}
        >
          Discipline · Consistency · Progress
        </p>
      </div>
    </div>
  );
}
