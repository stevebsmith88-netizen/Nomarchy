// Keeps the map coordinates we store for Google places fresh. Google's terms
// allow storing a place ID indefinitely but coordinates for only about 30
// days, so a daily job (app/api/refresh-coords) re-asks Google for anything
// not confirmed in the last REFRESH_AFTER_DAYS - well inside the limit, so
// a few failed runs never push a place past it.
//
// Only latitude and longitude are fetched (Google's cheapest "Place Details"
// tier) and only lat, lng and coords_refreshed_at are written. Names,
// addresses, decrees, photos and notes are never touched.
//
// Dependencies are passed in (database client, fetch, clock) so the logic
// can be tested without the network.

const DETAILS_URL = "https://places.googleapis.com/v1/places/";
const PLACE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const TIMEOUT_MS = 8000;

export const REFRESH_AFTER_DAYS = 20;
// A place Google couldn't find is asked about again only this often, so
// it doesn't use up every day's batch.
const RETRY_GONE_AFTER_DAYS = 7;
// Keeps one run well inside the route's time limit; anything left over is
// simply picked up by the next daily run.
export const MAX_PLACES_PER_RUN = 150;
const CONCURRENCY = 5;

// Asks Google for one place's current coordinates.
//   { status: "ok", lat, lng }
//   { status: "gone" }    - Google says that place ID no longer exists
//   { status: "error" }   - anything else (timeout, quota, outage); try again later
export async function fetchCoords(placeId, { apiKey, fetchImpl = fetch, onCall } = {}) {
  if (!apiKey || !PLACE_ID.test(placeId || "")) return { status: "error" };
  try { await onCall?.(); } catch {}
  try {
    const res = await fetchImpl(`${DETAILS_URL}${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "location" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return { status: "gone" };
    if (!res.ok) {
      console.error(`Coordinate refresh: Google returned ${res.status} for a place`);
      return { status: "error" };
    }
    const body = await res.json();
    const lat = body?.location?.latitude;
    const lng = body?.location?.longitude;
    if (typeof lat !== "number" || typeof lng !== "number") return { status: "error" };
    return { status: "ok", lat, lng };
  } catch (err) {
    console.error("Coordinate refresh: request failed", err?.message);
    return { status: "error" };
  }
}

// Places due for a refresh, oldest first (never-confirmed first of all),
// each place ID once no matter how many people saved it.
async function loadDue(admin, cutoffIso, retryCutoffIso, limit) {
  const { data: recentlyGone, error: goneErr } = await admin
    .from("place_refresh_issues")
    .select("google_place_id")
    .gt("noted_at", retryCutoffIso);
  // If that table doesn't exist yet, carry on without it rather than fail.
  const skip = new Set(goneErr ? [] : recentlyGone.map((r) => r.google_place_id));
  // Places the owner has marked permanently closed are never refreshed -
  // their coordinates were cleared when they were marked.
  const { data: closed } = await admin.from("closed_places").select("google_place_id");
  for (const r of closed || []) skip.add(r.google_place_id);

  const due = new Map(); // placeId -> { name }
  for (const table of ["thrones", "next_in_line"]) {
    const { data, error } = await admin
      .from(table)
      .select("google_place_id, place_name, coords_refreshed_at")
      .not("google_place_id", "is", null)
      .or(`coords_refreshed_at.is.null,coords_refreshed_at.lt.${cutoffIso}`)
      .order("coords_refreshed_at", { ascending: true, nullsFirst: true })
      .limit(limit);
    if (error) throw error;
    for (const row of data) {
      if (skip.has(row.google_place_id)) continue;
      if (!due.has(row.google_place_id)) due.set(row.google_place_id, { name: row.place_name, at: row.coords_refreshed_at });
    }
  }
  return [...due.entries()]
    .sort((a, b) => (a[1].at ? new Date(a[1].at).getTime() : 0) - (b[1].at ? new Date(b[1].at).getTime() : 0))
    .slice(0, limit)
    .map(([placeId, v]) => ({ placeId, name: v.name }));
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }));
  return results;
}

export async function refreshCoords(admin, { apiKey, fetchImpl, onCall, now = () => Date.now(), limit = MAX_PLACES_PER_RUN } = {}) {
  const cutoffIso = new Date(now() - REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const retryCutoffIso = new Date(now() - RETRY_GONE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const due = await loadDue(admin, cutoffIso, retryCutoffIso, limit);
  const summary = { due: due.length, refreshed: 0, gone: 0, errors: 0 };
  if (due.length === 0) return summary;

  const results = await mapLimit(due, CONCURRENCY, async (p) => ({ ...p, result: await fetchCoords(p.placeId, { apiKey, fetchImpl, onCall }) }));
  const stamp = new Date(now()).toISOString();

  for (const { placeId, name, result } of results) {
    if (result.status === "ok") {
      // Every saved copy of this place (anyone's crown, anyone's list) in
      // one go. Only rows that still carry this exact place ID are touched.
      for (const table of ["thrones", "next_in_line"]) {
        const { error } = await admin
          .from(table)
          .update({ lat: result.lat, lng: result.lng, coords_refreshed_at: stamp })
          .eq("google_place_id", placeId);
        if (error) { summary.errors += 1; continue; }
      }
      // A place that was flagged and is now found again clears itself.
      await admin.from("place_refresh_issues").delete().eq("google_place_id", placeId);
      summary.refreshed += 1;
    } else if (result.status === "gone") {
      // Leave the saved place exactly as it is (its map pin will simply
      // stop being refreshed) and flag it so the owner can decide.
      await admin.from("place_refresh_issues").upsert(
        { google_place_id: placeId, place_name: name, noted_at: stamp },
        { onConflict: "google_place_id" }
      );
      summary.gone += 1;
    } else {
      summary.errors += 1;
    }
  }
  return summary;
}
