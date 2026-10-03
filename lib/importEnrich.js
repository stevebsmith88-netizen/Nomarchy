// Checks the places in an imported list with Google, so each one that's
// clearly the right restaurant arrives with its Google ID, address, map pin
// and (where Google is confident) a suggested cuisine - the same as adding
// it by hand with "Add a place". Anything unclear is simply left as typed:
// a wrong automatic match is worse than no match.
//
// Dependencies are passed in (the Google search, closed-place list) so the
// logic can be tested without the network.

import { pickByName } from "./placeMatch";
import { suggestCuisineName } from "./cuisineFromGoogle";

// Keeps one import's Google cost and run time bounded; the rest of a very
// long list is still imported, just without the Google details.
export const MAX_ENRICH = 40;
const CONCURRENCY = 4;

// The Google result that's clearly this restaurant, or null: an exact name
// (ignoring case, accents, punctuation and a leading "The"), or a partial
// name (Google adds a word like "Pizzeria") only when it's Google's first
// result. Closed places never match.
export function pickMatch(row, results, closedIds = new Set()) {
  return pickByName(row, results, closedIds)?.match ?? null;
}

export function toEnrichment(match) {
  return {
    googlePlaceId: match.googlePlaceId,
    address: match.address || "",
    neighbourhood: match.neighbourhood || "",
    lat: match.lat ?? null,
    lng: match.lng ?? null,
    mapsUrl: match.mapsUrl || "",
    suggestedCuisine: suggestCuisineName(match.primaryType, match.types),
  };
}

// rows: [{ name, area }] -> one entry per row, in order: an enrichment, or
// null where there's no clear match (or the row is beyond MAX_ENRICH).
export async function enrichRows(rows, city, { search, closedIds = new Set() }) {
  const out = new Array(rows.length).fill(null);
  const work = rows.slice(0, MAX_ENRICH);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, work.length) }, async () => {
    while (next < work.length) {
      const i = next++;
      const row = work[i];
      try {
        const query = [row.name, row.area].filter(Boolean).join(" ");
        const match = pickMatch(row, await search(query, city), closedIds);
        if (match) out[i] = toEnrichment(match);
      } catch {}
    }
  }));
  return out;
}
