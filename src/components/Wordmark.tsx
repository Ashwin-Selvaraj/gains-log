/**
 * The product name, always uppercase and always in the display face.
 *
 * One component rather than the same classes copied into the header, the
 * splash and the sign-in screen — the three places it appears were already
 * drifting apart in size and letter-spacing.
 */
export function Wordmark({
  className = '',
  tracking = '0.14em',
}: {
  className?: string;
  /** Anton is tightly spaced by default; caps need it opened up. */
  tracking?: string;
}) {
  return (
    <span
      className={`font-display uppercase leading-none ${className}`}
      style={{ letterSpacing: tracking }}
    >
      Gains Log
    </span>
  );
}

/**
 * The artwork behind the splash and the sign-in screen.
 *
 * A <picture> rather than one image scaled to fit: these are different crops,
 * not different sizes, and a phone should never download the 1536px landscape
 * file. The media query is the same breakpoint Tailwind calls `md`.
 *
 * Desktop uses one landscape image for both screens. On a phone they differ:
 * the splash gets the three-panel triptych, which reads as a title card, and
 * the login gets the single-figure portrait, which sits better behind a form
 * than three competing subjects do.
 */
export function BackgroundArt({
  mobileSrc,
  className = '',
}: {
  mobileSrc: '/bg-mobile.webp' | '/splash-mobile.webp';
  className?: string;
}) {
  return (
    <picture>
      <source media="(min-width: 768px)" srcSet="/bg-desktop.webp" />
      {/* eslint-disable-next-line @next/next/no-img-element -- next/image cannot
          art-direct between two different crops, and these are fixed assets
          with no layout shift to guard against. */}
      <img src={mobileSrc} alt="" aria-hidden className={className} />
    </picture>
  );
}
