// Personal invite links: nomarchy.ca/<username>?invite=<username>.
// The browser keeps the username from the most recent invite link opened,
// and once a brand-new account signs in it's handed to the database
// (claim_invite in schema.sql), which makes every decision - only a new
// account, never across a block, only once - so nothing here can connect
// two people on its own, and nothing here can block a sign-in.

const STORAGE_KEY = "nomarchy-invite";
const USERNAME = /^[a-z0-9-]{3,30}$/;

export function cleanInvite(value) {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return USERNAME.test(v) ? v : null;
}

export function getStoredInvite() {
  try { return cleanInvite(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

// The latest invite wins - if two friends send links, the one you joined
// from is the one you clicked last.
export function captureInviteFromUrl() {
  try {
    const invite = cleanInvite(new URLSearchParams(window.location.search).get("invite"));
    if (invite) localStorage.setItem(STORAGE_KEY, invite);
  } catch {}
}

function clearStoredInvite() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function inviteUrl(username) {
  return `https://nomarchy.ca/${username}?invite=${username}`;
}

// Run once a person is signed in. Returns the inviter's name when this
// sign-in connected them (for a welcome message), otherwise null. Like the
// sign-up source, it falls back to the invite attached to the sign-up
// request itself, which survives the emailed link opening in another
// browser. A network failure keeps the invite for the next load.
export async function claimInvite(supabase, user) {
  try {
    const invite = getStoredInvite() || cleanInvite(user.user_metadata?.signup_invite);
    if (!invite) return null;
    const { data, error } = await supabase.rpc("claim_invite", { p_username: invite });
    if (error) return null;
    clearStoredInvite();
    return typeof data === "string" && data ? data : null;
  } catch {
    return null;
  }
}
