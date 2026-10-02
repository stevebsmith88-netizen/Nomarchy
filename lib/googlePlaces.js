// Server-side Google Places (New) text search, used by the place lookup in
// app/api/ai/route.js. Returns results in the same shape the old AI lookup
// did, plus the Google place ID and coordinates.
//
// Returns null (never throws) when it can't produce an answer - no key
// configured, Google refusing the request, a timeout - so the caller can
// fall back to the previous lookup instead of showing an error.
//
// Deliberately not cached: Google's terms don't allow storing Places
// results beyond the place ID (and coordinates for up to 30 days), so
// nothing returned here goes into the shared lookup cache.

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.googleMapsUri",
  "places.addressComponents",
  "places.primaryType",
  "places.types",
].join(",");
const TIMEOUT_MS = 8000;

function neighbourhoodFrom(components) {
  if (!Array.isArray(components)) return "";
  const wanted = ["neighborhood", "sublocality_level_1", "sublocality"];
  for (const type of wanted) {
    const match = components.find((c) => Array.isArray(c.types) && c.types.includes(type));
    if (match?.longText) return match.longText;
  }
  return "";
}

export function toResult(place) {
  const name = place?.displayName?.text;
  if (!place?.id || !name) return null;
  const lat = place.location?.latitude;
  const lng = place.location?.longitude;
  return {
    name,
    address: place.formattedAddress || "",
    neighbourhood: neighbourhoodFrom(place.addressComponents),
    rating: "",
    mapsUrl: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${place.id}`,
    googlePlaceId: place.id,
    lat: typeof lat === "number" ? lat : null,
    lng: typeof lng === "number" ? lng : null,
    primaryType: place.primaryType || "",
    types: Array.isArray(place.types) ? place.types : [],
  };
}

// onCall, if given, runs just before each request actually goes to Google
// (not when there's no key or no query), so usage can be counted.
export async function searchGooglePlaces(query, city, { apiKey = process.env.GOOGLE_PLACES_API_KEY, fetchImpl = fetch, onCall } = {}) {
  if (!apiKey || !query?.trim()) return null;
  try { await onCall?.(); } catch {}

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: `${query.trim()} ${(city || "").trim()}`.trim(),
        maxResultCount: 3,
        languageCode: "en",
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Shows up in Vercel's function logs - the usual causes are the API
      // not being enabled, a restricted key, or a quota/billing problem.
      console.error("Google Places search failed", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return null;
    }
    const data = await res.json();
    const results = (data.places || []).map(toResult).filter(Boolean).slice(0, 3);
    return results;
  } catch (err) {
    console.error("Google Places search error", err?.name || err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
