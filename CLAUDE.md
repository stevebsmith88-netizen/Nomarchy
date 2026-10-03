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

## Parked ideas (agreed with Steve, not yet built)

Pick these up when Steve asks "what's next" - each still needs his
sign-off on the UI before building.

- FAQ split into fold-down categories (about the app, using it, the
  royal words, account & privacy), plus new questions: what the app is
  for, and how it differs from review apps (without naming any).
- Auto-saved decree drafts, so a half-written decree survives closing
  the pop-up.
- Public restaurant pages.
- Personal invite links.
- Group Privy Council (deciding where to eat together).
