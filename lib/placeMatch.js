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

const NEAR_METERS = 400;

function locationAgrees(row, result) {
  const hasCoords = Number.isFinite(row.lat) && Number.isFinite(row.lng) && Number.isFinite(result.lat) && Number.isFinite(result.lng);
  if (hasCoords && distanceMeters(row.lat, row.lng, result.lat, result.lng) <= NEAR_METERS) return true;
  return addressMatches(row.address, result.address);
}

// row: { name, address, lat, lng }   results: Google results, best first.
// Returns { status: "auto", match } when one result is clearly the same
// place, { status: "review", candidates } when there are results but no
// clear match, or { status: "none" } when Google found nothing.
export function decide(row, results) {
  if (!Array.isArray(results) || results.length === 0) return { status: "none" };

  const candidates = results.filter((r) => r?.googlePlaceId);
  if (candidates.length === 0) return { status: "none" };

  // Same name AND same spot.
  const confirmed = candidates
    .map((r) => ({ r, name: nameMatch(row.name, r.name) }))
    .filter((c) => c.name && locationAgrees(row, c.r))
    .sort((a, b) => (a.name === "exact" ? 0 : 1) - (b.name === "exact" ? 0 : 1));
  if (confirmed.length > 0) return { status: "auto", match: confirmed[0].r };

  // A place we only know by name (a pasted list): safe only if exactly one
  // result has that exact name - otherwise it could be any branch.
  const hasLocationEvidence = Number.isFinite(row.lat) || (row.address && /\d/.test(row.address));
  if (!hasLocationEvidence) {
    const exact = candidates.filter((r) => nameMatch(row.name, r.name) === "exact");
    if (exact.length === 1 && candidates.length === 1) return { status: "auto", match: exact[0] };
  }

  return { status: "review", candidates: candidates.slice(0, 3) };
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
