# Nomarchy

A kingdom of your favorite restaurants, one cuisine at a time. Crown a
restaurant as the ruling spot for a cuisine, keep a "Next in Line" shortlist
of challengers, and stage a coup whenever something better comes along -
every past ruler is archived automatically. Follow friends, endorse their
picks, and see who's earned the most taste credibility in your Court.

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

- `schema.sql` - the Supabase/Postgres schema: `profiles` (auto-created on
  signup, username always gets a random 4-character suffix), `cuisines`
  (shared defaults plus per-user customs), `thrones` (the current ruler per
  cuisine - one per `user_id` + `cuisine_id`), `fallen` (past reigns,
  archived automatically by a trigger that fires only when the *restaurant*
  changes, not on every decree edit), `next_in_line` (a private shortlist),
  `endorsements` and `follows` (the social layer behind Court), `ai_calls`
  (rate-limits the AI route), and a `standings` view that computes taste
  credibility on read so it can never drift out of sync. Row level security
  is on every table - thrones, fallen, cuisines, endorsements and follows
  are public-read (that's what makes Court and endorsing work), next_in_line
  is private to its owner.
- `lib/data.js` - the Supabase client plus every read/write: auth
  (`signIn`/`signOut`/`onAuthChange`), the kingdom (`loadKingdom`,
  `crownSpot`, `promoteToThrone`, `abdicate`), the shortlist
  (`loadNextInLine`, `addToNextInLine`, `importToNextInLine`), cuisines
  (`loadCuisines`, `addCuisine`), and the social layer (`loadCourt`,
  `toggleEndorsement`, `followByUsername`, `loadStanding`,
  `loadPublicKingdom`).
- `app/api/ai/route.js` - a server route that verifies the caller's Supabase
  session, rate-limits to 30 calls/hour/user (enforced against the `ai_calls`
  table, not an in-memory counter - those don't survive a restart or share
  state across serverless instances), and proxies two AI modes to Claude:
  `lookup` (web-search-backed restaurant lookup, standing in for Google
  Places) and `import` (parses a pasted block of text into structured
  restaurant entries via structured outputs, so the client never has to
  strip markdown fences or hunt for JSON brackets). Never call Anthropic
  directly from the browser - the API key must stay server-side.
- `app/page.js` - the whole UI: sign-in screen, the Kingdom grid, Next in
  Line, Court (follow friends by username, see their reigning picks,
  endorse them, pull one onto your own shortlist), Standing (a credibility
  score and rank title from Peckish Peasant up to Monarch of Taste), the
  crown/coup modal (30-character minimum decree, validated client-side and
  by a database constraint), and the text-import flow.

Styling is Tailwind CSS v4 (`@import "tailwindcss"` in `app/globals.css` +
`@tailwindcss/postcss`), plus Fraunces and Archivo from Google Fonts.

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
- **Court, endorsements, and follows are already live**, ahead of the
  original build order (which suggested holding social features until sign
  in, crowning, and next-in-line had a couple of weeks of real use). It was
  already fully designed and wired up, so it shipped rather than sitting
  half-built - but it's worth watching how it lands with actual friend
  groups before investing further here.
- **Public profile pages (`/username`), share-card images, and a PWA
  manifest are still deferred.** `loadPublicKingdom` in `lib/data.js` is
  ready for a public profile route whenever that's next - it isn't wired to
  a page yet.
