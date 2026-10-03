// Helpers for the public restaurant pages (app/r/[slug]). The page's data
// comes from place_page() in schema.sql - crowns from Public kingdoms
// only, plus total want-to-try / been numbers.

export const SITE_URL = "https://nomarchy.ca";
const OVERALL = "Overall Favourite";

export function restaurantUrl(slug) {
  return `${SITE_URL}/r/${slug}`;
}

// A Google Maps link that opens this exact place - free, unlike an
// embedded map, and keeps Google's own data on Google.
export function googleMapsUrl(page) {
  const query = [page.name, page.address || page.neighbourhood, page.city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${encodeURIComponent(page.google_place_id)}`;
}

// The cuisines it's been crowned for, most-crowned first, with Overall
// Favourite last so the real cuisine leads ("Pizza · Overall Favourite").
export function crownedCuisines(crowns) {
  const counts = new Map();
  for (const c of crowns || []) {
    if (!c.cuisine) continue;
    const row = counts.get(c.cuisine) || { name: c.cuisine, id: c.cuisine_id, emoji: c.cuisine_emoji, count: 0 };
    row.count += 1;
    counts.set(c.cuisine, row);
  }
  return [...counts.values()].sort((a, b) =>
    (a.name === OVERALL) - (b.name === OVERALL) || b.count - a.count || a.name.localeCompare(b.name));
}

export function bestRankLabel(page) {
  if (!page.best_rank) return null;
  return `#${page.best_rank} in Best in the Land${page.city ? ` in ${page.city}` : ""}`;
}

// Deleted accounts that chose to leave their crowns up have no kingdom to
// link to (see app/api/delete-account).
export function kingdomPath(username) {
  return username && !username.startsWith("former-member-") ? `/${username}` : null;
}

// The link preview, and whether search engines may list the page: only
// once a Public kingdom has crowned it, so empty pages stay out of search.
export function restaurantPreview(page) {
  if (!page) return { title: "Nomarchy" };
  const where = [page.neighbourhood, page.city].filter(Boolean).join(", ");
  const crowned = page.crown_count > 0
    ? `Crowned ${page.crown_count === 1 ? "once" : `${page.crown_count} times`} on Nomarchy`
    : "Not crowned on Nomarchy yet - be the first";
  const title = `${page.name}${where ? ` (${where})` : ""}`;
  const description = page.closed
    ? `${page.name} has permanently closed.`
    : `${crowned}. See why people made it their favourite.`;
  const image = { url: "/icon-512.png", width: 512, height: 512 };
  return {
    title,
    description,
    alternates: { canonical: restaurantUrl(page.slug) },
    robots: page.crown_count > 0 ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title: `${title} | Nomarchy`, description, url: restaurantUrl(page.slug), images: [image] },
    twitter: { card: "summary", title: `${title} | Nomarchy`, description, images: [image.url] },
  };
}
