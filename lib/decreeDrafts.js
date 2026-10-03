// Unsent decrees, kept on this device so a half-written one survives the
// pop-up being closed by accident, the phone locking, or the app reloading.
// Nothing here is sent to the server - drafts live in this browser only,
// are kept per account, expire after a week, and are all wiped on sign-out
// (so the next person on a shared device never sees them).
//
// Every storage call is wrapped: private browsing or blocked storage just
// means no drafts, never a broken pop-up.

const PREFIX = "nomarchy-drafts:";
export const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function storageKey(userId) {
  return PREFIX + userId;
}

function readAll(userId, now) {
  try {
    const all = JSON.parse(localStorage.getItem(storageKey(userId)) || "{}");
    if (!all || typeof all !== "object") return {};
    // Old drafts quietly drop off rather than reappearing weeks later.
    for (const k of Object.keys(all)) {
      if (!all[k] || typeof all[k].at !== "number" || now - all[k].at > DRAFT_MAX_AGE_MS) delete all[k];
    }
    return all;
  } catch {
    return {};
  }
}

function writeAll(userId, all) {
  try {
    if (Object.keys(all).length === 0) localStorage.removeItem(storageKey(userId));
    else localStorage.setItem(storageKey(userId), JSON.stringify(all));
  } catch {}
}

// The saved draft for this spot (e.g. "crown:<cuisineId>"), or null.
export function loadDraft(userId, key, now = Date.now()) {
  if (!userId || !key) return null;
  return readAll(userId, now)[key]?.data ?? null;
}

// Saves (or, with no decree text, removes) the draft for this spot.
export function saveDraft(userId, key, data, now = Date.now()) {
  if (!userId || !key) return;
  const all = readAll(userId, now);
  if (data && typeof data.text === "string" && data.text.trim()) all[key] = { at: now, data };
  else delete all[key];
  writeAll(userId, all);
}

export function clearDraft(userId, key) {
  saveDraft(userId, key, null);
}

// Removes every account's drafts from this device - called on sign-out.
export function clearAllDrafts() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) localStorage.removeItem(k);
    }
  } catch {}
}
