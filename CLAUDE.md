@AGENTS.md

## Working agreement with Steve

- Any change that affects the UI - a new screen, a changed layout, new
  copy the user sees, a different flow - gets confirmed with Steve
  before being built, not after. Backend-only fixes (data, RLS, bug
  fixes with no visible behaviour change) don't need this.
- Any user-facing feature add, move, or rename (a new section, a button
  that moves to a different screen, a renamed feature) gets checked
  against everything that describes the app to the user, and updated in
  the same change: `app/faq/FaqContent.js` (the FAQ accordion),
  `lib/changelog.js` (the shared "what's new" list read by both the
  in-app notification feed and the re-engagement email), and the
  landing page's illustrative content in `app/page.js`
  (`EXAMPLE_THRONES`/`PhonePreview`). Each of these drifts silently
  otherwise - e.g. the FAQ told people to use "the Feedback button at
  the top of the app" after Feedback had already moved into Profile
  settings.

## Database changes

- schema.sql is the single source of truth and must stay safe to re-run.
  After any edit to it, run `npm run db:check`: it re-stamps schema.sql's
  version and regenerates database-check.sql (the read-only query Steve
  pastes into Supabase to confirm the live database is up to date). The
  unit tests fail until it's been run.
- Other people can read only the public columns of `profiles` (id,
  username, display_name, city, avatar_url, is_owner, is_public,
  discoverable). A person's own full row comes from `my_profile()`; the
  owner's user list from `admin_profiles()`. Never `select("*")` profiles
  from the browser, and don't add `.select()` after a profile update.

## Parked ideas (agreed with Steve, not yet built)

Pick these up when Steve asks "what's next" - each still needs his
sign-off on the UI before building.

- Keep keyboard focus inside an open pop-up (Tab can currently move to
  buttons behind it). Backend-style fix, no visible change.
- Raise the 23 uses of 10-11px text to at least 12px by default (the
  Larger text setting already enlarges them). Visible - show Steve a
  before/after first.
- Show where a place already is, instead of "Add to my list": when viewing
  someone's kingdom (a friend's pop-up, or a public kingdom) or a Privy
  Council suggestion, a place that is already crowned in your Kingdom or on
  your Next in Line should say so ("Crowned in your Kingdom" / "On your
  list" / "Been there") rather than offering to add it. Restaurant pages
  should show the same status up front (today they only say it after the
  Add button is tapped). Reuse the existing already-saved checks
  (addToPretenders in NomarchyApp.js; savedPlaceStatus in lib/data.js),
  matching by Google ID first, then name. Visible - confirm the wording
  with Steve before building.
- Group Privy Council (deciding where to eat together).
- A "Crowned on Nomarchy" window sticker / digital badge for restaurants
  with several crowns, built on the restaurant pages (app/r/[slug]).
- Paid placement (e.g. a sponsored Privy Council suggestion) is a
  possibility later, so never promise "no ads" or "no paid placements"
  in user-facing copy.
