// Map links shown to other people come from saved data that a user could
// have written directly to the database, so only ordinary Google Maps links
// are ever turned into a clickable link; anything else is dropped.
export function safeMapsUrl(url) {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    const ok = host === "google.com" || host.endsWith(".google.com") || host.endsWith(".google.ca") || host === "goo.gl" || host === "maps.app.goo.gl";
    return ok ? u.toString() : null;
  } catch {
    return null;
  }
}
