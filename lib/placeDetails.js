// Works out what a Google place can fill in on saved rows that already have
// its Google ID (see app/api/admin/backfill-places, "details" mode). Only
// BLANK fields are ever filled, and a cuisine only on Next in Line entries
// with none, from Google's category (see lib/cuisineFromGoogle.js).

import { suggestCuisineName } from "./cuisineFromGoogle";

const blank = (v) => v === null || v === undefined || String(v).trim() === "";

// rows: [{ table, address, neighbourhood, city, maps_url, cuisine_id }]
// place: a Google result (toResult shape).
// Returns null when there is nothing to fill, else the values to fill and
// how many rows each would reach.
export function planFill(rows, place) {
  const values = {
    address: place.address || "",
    neighbourhood: place.neighbourhood || "",
    city: place.city || "",
    mapsUrl: place.mapsUrl || "",
    cuisine: suggestCuisineName(place.primaryType, place.types) || "",
  };
  const columns = { address: "address", neighbourhood: "neighbourhood", city: "city", mapsUrl: "maps_url", cuisine: "cuisine_id" };
  const counts = { address: 0, neighbourhood: 0, city: 0, mapsUrl: 0, cuisine: 0 };
  let noCuisineSuggestion = 0;
  for (const r of rows) {
    for (const key of Object.keys(counts)) {
      if (key === "cuisine" && r.table !== "next_in_line") continue;
      if (!blank(r[columns[key]])) continue;
      if (values[key]) counts[key] += 1;
      else if (key === "cuisine") noCuisineSuggestion += 1;
    }
  }
  if (Object.values(counts).every((n) => n === 0)) return noCuisineSuggestion ? { values, counts, noCuisineSuggestion } : null;
  return { values, counts, noCuisineSuggestion };
}
