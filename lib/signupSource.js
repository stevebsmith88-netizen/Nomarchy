// Tracks which link a new signup came from (?ref=ig_story and so on).
// The browser keeps the FIRST valid tag it ever sees and never replaces
// it; the database makes the final call on whether it gets saved (see
// record_signup_source in schema.sql) - so nothing here can overwrite a
// source, and nothing here can block a sign-in.

const STORAGE_KEY = "nomarchy-signup-ref";
const REF_PATTERN = /^[A-Za-z0-9_]{1,32}$/;
const FRESH_ACCOUNT_MS = 2 * 60 * 60 * 1000;

export function cleanRef(value) {
  if (typeof value !== "string" || !REF_PATTERN.test(value)) return null;
  return value.toLowerCase();
}

export function getStoredRef() {
  try { return cleanRef(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

// First valid tag wins - an already-saved one is never replaced, and a
// visit with no tag (like Google sending someone back to the site) leaves
// it alone.
export function captureRefFromUrl() {
  try {
    const ref = cleanRef(new URLSearchParams(window.location.search).get("ref"));
    if (ref && !getStoredRef()) localStorage.setItem(STORAGE_KEY, ref);
  } catch {}
}

function clearStoredRef() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

// Run once a person is signed in. A saved tag is handed to the database
// and then dropped from the browser; if the database says no (an existing
// account, or one that already has a source) it simply does nothing. A
// network failure keeps the tag for the next load instead of losing it.
// Also falls back to the tag attached to the sign-up request itself, which
// is what survives opening the emailed link in a different browser - only
// trusted for accounts created in the last couple of hours.
export async function claimSignupSource(supabase, user) {
  try {
    const stored = getStoredRef();
    const created = new Date(user.created_at).getTime();
    const fresh = Number.isFinite(created) && Date.now() - created < FRESH_ACCOUNT_MS;
    const fromSignup = fresh ? cleanRef(user.user_metadata?.signup_ref) : null;
    const ref = stored || fromSignup;
    if (!ref) return;
    const { error } = await supabase.rpc("record_signup_source", { p_ref: ref });
    if (!error) clearStoredRef();
  } catch {}
}
