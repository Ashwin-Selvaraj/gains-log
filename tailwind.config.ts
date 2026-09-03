import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  // Follow the system preference — no in-app theme toggle to fiddle with.
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        /**
         * The wordmark face. Anton is a heavy condensed grotesque of the kind
         * used on gym posters and race numbers — the same register as the
         * "DISCIPLINE BUILDS FREEDOM" lettering in the app's own artwork. It
         * is display-only: one weight, uppercase, and unreadable at body size,
         * so it is never applied to running text.
         */
        display: ['var(--font-display)', 'Impact', 'Haettenschweiler', 'sans-serif'],
      },
      colors: {
        surface: 'rgb(var(--surface) / <alpha-value>)',
        card: 'rgb(var(--card) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
      },
    },
  },
  plugins: [],
} satisfies Config;
