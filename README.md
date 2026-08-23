# Gains Log

A single-user daily tracker for a muscle-gain journey. Log habits, weight, sleep,
meetings and meals from your phone; read the weekly report from your laptop. Same
data either way.

- **Today** — four stamp buttons, the day's numbers, meetings, and three ways to log
  a meal (saved preset, typed, or a photo Claude estimates for you). Everything
  auto-saves; there is no save button.
- **My Meals** — the presets you eat regularly, so breakfast is one tap.
- **Weekly Report** — 7-day average weight and its change, distance to the 85 kg goal,
  habit streak percentages, average sleep, meetings logged, average calories and
  protein, and a 4-week weight trend.
- **History** — the last 7 days always listed (logged or not, so you can backfill
  yesterday), then every older day you logged, each expandable into a full editor.

Installable as a PWA, readable offline, and writes made offline sync when you
reconnect.

---

## Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS, light/dark via system preference |
| Database | Prisma — SQLite locally, Postgres in production |
| AI | `@anthropic-ai/sdk`, `claude-opus-5` vision for photo estimates |
| Offline | Service worker + a localStorage write outbox |

---

## Run it locally

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npm run db:push && npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000. The seed adds a few meal presets — edit or delete them
on the **My Meals** tab.

To use the food-photo estimate, put a key from
[console.anthropic.com](https://console.anthropic.com/settings/keys) into `.env`:

```
ANTHROPIC_API_KEY="sk-ant-..."
```

Without it the rest of the app works normally and the photo button returns a clear
"key not set" message.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` / `npm start` | Production build and serve |
| `npm run db:push` | Apply `prisma/schema.prisma` to whatever `DATABASE_URL` points at |
| `npm run db:seed` | Add the starter meal presets (safe to re-run) |
| `npm run db:studio` | Prisma Studio, to poke at the data directly |

---

## How the database switches between SQLite and Postgres

There is one schema file. `scripts/set-db-provider.mjs` runs before every
`generate` / `dev` / `build` and rewrites the datasource provider to match
`DATABASE_URL`:

| `DATABASE_URL` | Provider |
|---|---|
| `file:./dev.db` | `sqlite` |
| `postgres://…` or `postgresql://…` | `postgresql` |

So local dev needs no database setup, and deploying just means setting a Postgres
URL. The schema deliberately avoids enums and `Decimal` so the same models work on
both engines — `MealEntry.source` is a string constrained in the API layer instead.

Schema changes are applied with `prisma db push` rather than migrations. For a
single-user app with one deployment that's the right trade: no migration history to
maintain, and the build applies the schema automatically.

---

## Deploy: Vercel + Neon

The result is one HTTPS URL that works identically on your phone and laptop.

**1. Create the Postgres database.** Sign up at [neon.tech](https://neon.tech), create
a project, and copy the **pooled** connection string. It looks like:

```
postgresql://user:password@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
```

Use the pooled one (`-pooler` in the host). Serverless functions open a lot of short
connections and a direct URL will exhaust the connection limit.

**2. Push this repo to GitHub** — already done if you cloned it from there.

**3. Import it on Vercel.** [vercel.com/new](https://vercel.com/new) → pick the repo →
before deploying, add two environment variables:

| Name | Value |
|---|---|
| `DATABASE_URL` | your Neon pooled connection string |
| `ANTHROPIC_API_KEY` | your Anthropic key |

Deploy. The build runs `prisma db push` against Neon automatically, so the tables are
created on the first deploy — no manual migration step.

**4. Seed the presets once** (optional). From your machine, with the Neon URL:

```bash
DATABASE_URL="postgresql://...pooler...?sslmode=require" npm run db:seed
```

**5. Add it to your home screen.**

- **iOS** — open the Vercel URL in Safari (it must be Safari), tap Share → *Add to
  Home Screen*. It then opens full-screen with no browser chrome.
- **Android** — open in Chrome, tap the ⋮ menu → *Install app*.

### Anything with Postgres works

Supabase, Vercel Postgres, Railway, Fly Postgres — set `DATABASE_URL` to their
connection string and the provider switch handles the rest. Host it anywhere that
runs a Node server; nothing here is Vercel-specific.

---

## Notes on the parts that are easy to get wrong

**Dates.** Every date is a `"YYYY-MM-DD"` string in *your* local timezone, computed in
the browser and sent to the server. Storing a `DateTime` and formatting it server-side
is how trackers end up filing your Tuesday morning workout under Monday when the
server runs in UTC.

**Offline writes.** `src/lib/sync.ts` routes every write through an outbox. When a
request fails at the transport level (no signal), it's queued in `localStorage` and
replayed in order on the next `online` event. Server errors are *not* queued — a 400
would never succeed on retry and would wedge the queue. A banner shows pending
count. One limitation: an item created offline can't be deleted until it syncs.

**Photo estimates.** The photo is downscaled to 1024px before upload (a raw camera
shot is several MB and gives the model nothing extra) and a 256px thumbnail is what's
stored on the meal. Claude is told explicitly that it's producing a rough estimate and
to flag unclear photos; you always see and can edit the calories and protein before
saving. Nothing is written to the database until you confirm.

**Evening reminder.** This is a *local* notification, scheduled with `setTimeout` while
the app is open. A real scheduled push — one that fires with the app closed — needs
VAPID keys, a stored push subscription, and a server-side scheduler, which is a lot of
infrastructure for one person's nudge. The toggle is on the Today screen.

**Security.** There is no auth, by design — the brief is a single user. Anyone with the
URL can read and write the data. If that matters, put Vercel's password protection in
front of it, or add a shared-secret cookie check in `middleware.ts`.

**`npm audit`.** Three advisories remain, all in `deepmerge-ts` reached through the
Prisma **CLI** — a build-time dev dependency that never runs in the deployed app. The
only fix offered is a Prisma downgrade, which isn't worth it.

---

## Data model

```
DailyEntry  (date is the unique key, "YYYY-MM-DD")
├─ workoutDone / walkDone / learningDone / sleptWell   booleans
├─ weightKg / sleepHours / walkMinutes                 nullable numbers
├─ workoutNote / learningNote                          text
├─ Meeting[]     time ("HH:MM"), title
└─ MealEntry[]   name, calories?, protein?,
                 source ("manual" | "preset" | "photo-estimate"), photoUrl?

MealPreset  (global)  name, calories?, protein?
```

Targets live in `src/lib/goals.ts` — starting weight, goal weight, protein and
calorie targets. Change them there.
