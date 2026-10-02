// Rules for when the first-time walkthrough starts by itself. Kept apart
// from the screen code so they can be tested on their own.

// Only accounts created after this moment get the tour automatically.
// Existing testers aren't interrupted; they can replay it any time from
// Your Profile.
export const TOUR_LAUNCH = "2026-10-02T21:30:00Z";

const LOCAL_KEY = "nomarchy-tour-seen";

export function tourSeenLocally() {
  try { return localStorage.getItem(LOCAL_KEY) === "1"; } catch { return false; }
}

export function rememberTourLocally() {
  try { localStorage.setItem(LOCAL_KEY, "1"); } catch {}
}

// databaseOk is false when the profile column isn't there yet (the SQL
// hasn't been run): then we never auto-start, rather than risk showing it
// to someone on every visit.
export function shouldAutoStartTour({ createdAt, onboarded, databaseOk, seenAt, locallySeen }) {
  if (!onboarded || !databaseOk || seenAt || locallySeen) return false;
  if (!createdAt) return false;
  return new Date(createdAt) > new Date(TOUR_LAUNCH);
}
