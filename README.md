# Nomarchy

A kingdom of your favorite restaurants, one cuisine at a time. Crown a
restaurant as the ruling spot for a cuisine, keep a "Next in Line" bench of
challengers, and stage a coup whenever something better comes along - every
past ruler is archived automatically.

## Setup

1. **Install dependencies** (already done if you cloned this repo with
   `node_modules` intact - otherwise `npm install`).

2. **Create a Supabase project** at [supabase.com](https://supabase.com):
   - **SQL Editor**: paste `schema.sql` and run it. Every statement is
     `if not exists` / `drop ... if exists` + `create`, so re-running is safe.
   - **Authentication -> Providers**: enable Email, and turn ON "Confirm
     email". This app uses magic links only, no passwords.
   - **Authentication -> URL Configuration**: add `http://localhost:3000/**`
     to Redirect URLs, and your production URL once you deploy. Missing this
     is the single most common cause of "login works locally, silently fails
     in production."
   - **Project Settings -> API**: copy the project URL and the `anon` public
     key.

3. **Environment variables** - copy `.env.local.example` to `.env.local` and
   fill in:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ANTHROPIC_API_KEY=sk-ant-...
   ```

   The two `NEXT_PUBLIC_` variables are meant to be public - the anon key is
   safe in the browser because row level security does the actual
   protecting. `ANTHROPIC_API_KEY` has no prefix on purpose, which keeps it
   server-only (used only from `app/api/ai/route.js`). Never add the prefix
   to it. `.env.local` is gitignored, so these never reach GitHub.

4. **Run it:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Deploying

Push to GitHub, import the repo on Vercel, add the same 3 environment
variables there, and deploy. Then go back to Supabase's Authentication ->
URL Configuration and add the live URL to Redirect URLs.

## How it's put together

- `schema.sql` - the Supabase/Postgres schema: `profiles`, `cuisines`,
  `thrones` (the current ruler per cuisine), `throne_history` (past reigns,
  archived automatically by a trigger on `thrones` UPDATE - a "coup"),
  `next_in_line` (candidates waiting for a throne), and `ai_calls` (used to
  rate-limit the AI route). Row level security restricts every table to its
  owning user.
- `lib/supabaseClient.js` - the browser Supabase client.
- `lib/data.js` - all reads/writes against Supabase: `loadKingdom`,
  `loadNextInLine`, `loadCuisines`, `loadStanding`, `crownSpot`,
  `promoteToThrone`, `addToNextInLine`, etc.
- `app/api/ai/route.js` - a server route that verifies the caller's Supabase
  session, rate-limits to 30 calls/hour/user, and proxies two AI modes to
  Claude: `lookup` (web-search-backed restaurant lookup, standing in for
  Google Places) and `import` (parses a pasted block of text into
  structured restaurant entries via structured outputs). Never call
  Anthropic directly from the browser - the API key must stay server-side.
- `app/page.js` - the whole UI: sign-in screen, kingdom grid, next-in-line
  list, crowning/coup modal (with a 30-character minimum "decree" - a
  database constraint, validated client-side too), add-cuisine and
  add-candidate modals, and the text-import flow.

## Things to know before you scale this up

- **Google Places isn't wired in yet.** The AI lookup mode is a stand-in and
  works fine at friend-group scale. When you swap in real Places data:
  restrict the API key to your domain, set a hard quota cap in Google Cloud
  on day one, and call Autocomplete from the client with Place Details from
  the server.
- **Anthropic costs.** The route caps import input at 8,000 characters and
  limits each user to 30 calls/hour. Watch usage for the first couple of
  weeks - the web-search lookup is the more expensive call.
- **Username collisions** get a random 4-character suffix
  (`steve` -> `steve-a4f2`) rather than failing signup. There's currently no
  UI to change it.
- **Social features (follows, a public court, public profiles at
  `/username`, share cards, a PWA manifest)** are deliberately not built
  yet. Get sign-in, crowning, coups, next-in-line, and import in front of a
  handful of real users first.
