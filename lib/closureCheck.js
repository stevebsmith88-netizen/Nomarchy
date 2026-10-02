// Owner-run check for places Google reports as permanently closed. Nothing
// here is stored: the answer is shown to the owner and forgotten, so no
// Google data is kept beyond the place IDs we already hold.
//
// Asks Google only for each place's business status. Dependencies are
// passed in (database client, fetch) so the logic can be tested offline.

const DETAILS_URL = "https://places.googleapis.com/v1/places/";
const PLACE_ID = /^[A-Za-z0-9_-]{10,200}$/;
const TIMEOUT_MS = 8000;

export const BATCH_SIZE = 40;
const CONCURRENCY = 5;

// { status: "open" | "closed" | "gone" | "error" }
//   closed = Google says permanently closed; gone = Google can't find the ID.
export async function fetchBusinessStatus(placeId, { apiKey, fetchImpl = fetch, onCall } = {}) {
  if (!apiKey || !PLACE_ID.test(placeId || "")) return { status: "error" };
  try { await onCall?.(); } catch {}
  try {
    const res = await fetchImpl(`${DETAILS_URL}${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "businessStatus" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return { status: "gone" };
    if (!res.ok) {
      console.error(`Closure check: Google returned ${res.status} for a place`);
      return { status: "error" };
    }
    const body = await res.json();
    return { status: body?.businessStatus === "CLOSED_PERMANENTLY" ? "closed" : "open" };
  } catch (err) {
    console.error("Closure check: request failed", err?.message);
    return { status: "error" };
  }
}

// Every distinct Google place we hold, with a name for display and how many
// crowns and list entries point at it. Sorted so batches are stable.
export async function loadPlaces(admin) {
  const [thrones, nextInLine] = await Promise.all([
    admin.from("thrones").select("google_place_id, place_name, address").not("google_place_id", "is", null),
    admin.from("next_in_line").select("google_place_id, place_name, address").not("google_place_id", "is", null),
  ]);
  if (thrones.error) throw thrones.error;
  if (nextInLine.error) throw nextInLine.error;

  const places = new Map();
  const add = (r, field) => {
    const p = places.get(r.google_place_id) || { placeId: r.google_place_id, name: r.place_name, address: r.address || "", crowns: 0, lists: 0 };
    p[field] += 1;
    places.set(r.google_place_id, p);
  };
  thrones.data.forEach((r) => add(r, "crowns"));
  nextInLine.data.forEach((r) => add(r, "lists"));
  return [...places.values()].sort((a, b) => a.placeId.localeCompare(b.placeId));
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

// One batch. offset is how many places the caller has already checked.
export async function checkClosures(admin, offset, { apiKey, fetchImpl, onCall } = {}) {
  const places = await loadPlaces(admin);
  const slice = places.slice(offset, offset + BATCH_SIZE);
  const checked = await mapLimit(slice, CONCURRENCY, async (p) => ({ ...p, ...(await fetchBusinessStatus(p.placeId, { apiKey, fetchImpl, onCall })) }));
  const next = offset + BATCH_SIZE;
  const pick = (status) => checked.filter((c) => c.status === status).map(({ name, address, crowns, lists }) => ({ name, address, crowns, lists }));
  return {
    total: places.length,
    nextOffset: next < places.length ? next : null,
    closed: pick("closed"),
    gone: pick("gone"),
    errors: checked.filter((c) => c.status === "error").length,
  };
}
