// Decides whether a Google result is clearly the same place as one we
// already have saved, for the one-time Google ID backfill (see
// app/api/admin/backfill-places). Cautious on purpose: a wrong automatic
// match is worse than sending a place to the review list, so anything that
// isn't clearly the same place is left for a person to confirm.

export function normalizeName(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^the /, "");
}

// "exact" after tidying punctuation, accents and a leading "The"; "partial"
// when one name contains the other (Google often adds or drops a word like
// "Coffee Company"), but only for names long enough that containment means
// something.
export function nameMatch(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y) return null;
  if (x === y) return "exact";
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 4 && ` ${long} `.includes(` ${short} `)) return "partial";
  return null;
}

export function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Same street number followed by the same first street word, e.g.
// "1112 Queen Street West" and "1112 Queen St W, Toronto" both give
// "1112 queen". Needs a number on our side - a neighbourhood alone isn't
// enough to call it the same place.
export function addressMatches(ours, theirs) {
  const m = (ours || "").toLowerCase().match(/(\d+)[a-z]?\s+([a-z]+)/);
  if (!m || !theirs) return false;
  return theirs.toLowerCase().includes(`${m[1]} ${m[2]}`);
}

const NEAR_METERS = 250;

// Why the location counts as agreeing, or null. Tight on purpose: our saved
// pins came from a free geocoder that can be off by a block or two, but
// downtown there can be dozens of restaurants within 400 m.
function locationEvidence(row, result) {
  const hasCoords = Number.isFinite(row.lat) && Number.isFinite(row.lng) && Number.isFinite(result.lat) && Number.isFinite(result.lng);
  if (hasCoords) {
    const d = distanceMeters(row.lat, row.lng, result.lat, result.lng);
    if (d <= NEAR_METERS) return `${Math.round(d)} m from the saved pin`;
  }
  if (addressMatches(row.address, result.address)) return "same street address";
  return null;
}

// For a saved place we only know by name (no address, no pin - typically an
// imported Next in Line entry): an exact name (ignoring case, accents,
// punctuation and a leading "The"), or a partial name only when it's
// Google's first result and the shorter name is at least 4 letters. The same
// rule the list import uses. Closed places never match.
export function pickByName(row, results, closedIds = new Set()) {
  const candidates = (results || []).filter((r) => r?.googlePlaceId && !closedIds.has(r.googlePlaceId));
  const exact = candidates.find((r) => nameMatch(row.name, r.name) === "exact");
  if (exact) return { match: exact, evidence: "exact name (no saved address to compare)" };
  const first = results?.[0];
  if (first && candidates.includes(first) && nameMatch(row.name, first.name) === "partial") {
    return { match: first, evidence: "Google's top result contains this name (no saved address to compare)" };
  }
  return null;
}

// row: { name, address, lat, lng }   results: Google results, best first.
// Returns { status: "auto", match, evidence } ONLY when the name is exactly
// the same (ignoring case, accents, punctuation and a leading "The") AND the
// location agrees. Everything else - a partial name, a place we only know by
// name, a right name in the wrong spot - goes to the review list with
// Google's top candidates, best guess first, so a person makes the call.
// { status: "none" } when Google found nothing.
export function decide(row, results) {
  if (!Array.isArray(results) || results.length === 0) return { status: "none" };

  const candidates = results.filter((r) => r?.googlePlaceId);
  if (candidates.length === 0) return { status: "none" };

  for (const r of candidates) {
    if (nameMatch(row.name, r.name) !== "exact") continue;
    const evidence = locationEvidence(row, r);
    if (evidence) return { status: "auto", match: r, evidence: `exact name, ${evidence}` };
  }

  // Nothing to compare a location against: judge by name alone.
  const hasLocation = (Number.isFinite(row.lat) && Number.isFinite(row.lng)) || !!(row.address || "").trim();
  if (!hasLocation) {
    const byName = pickByName(row, results);
    if (byName) return { status: "auto", ...byName };
  }

  // Best guess first: exact name, then partial name, then Google's own order.
  const rank = (r) => (nameMatch(row.name, r.name) === "exact" ? 0 : nameMatch(row.name, r.name) === "partial" ? 1 : 2);
  const ordered = [...candidates].sort((a, b) => rank(a) - rank(b));
  return { status: "review", candidates: ordered.slice(0, 3) };
}

// Same spelling clean-up the rest of the app uses to decide two saved
// places are the same restaurant ("Queen St W" = "Queen Street West"; the
// postal code and anything after the first comma is ignored).
const STREET_WORD = {
  street: "st", avenue: "ave", boulevard: "blvd", drive: "dr", road: "rd",
  place: "pl", lane: "ln", court: "ct", crescent: "cres", terrace: "terr",
  west: "w", east: "e", north: "n", south: "s",
};
function normalizeAddressPart(address) {
  if (!address) return "";
  return address
    .split(",")[0]
    .toLowerCase()
    .replace(/[a-z]\d[a-z]\s?\d[a-z]\d\s*$/i, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => STREET_WORD[word] || word)
    .join(" ");
}

// One Google search per unique place, not per saved row: several people
// crowning the same restaurant is a single lookup applied to all of them.
export function groupKey(row) {
  const where = normalizeAddressPart(row.address) || normalizeAddressPart(row.area);
  return [normalizeName(row.name), where, (row.city || "").trim().toLowerCase()].join("|");
}
