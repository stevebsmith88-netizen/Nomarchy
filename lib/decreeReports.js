// Reporting a decree on a restaurant page, and removing one from Admin.
// A report is an ordinary feedback message that carries the decree's id in a
// tag, so Admin can offer a "Remove this decree" button next to it.

// What a removed decree says instead. Longer than the 30-character minimum a
// decree must have, so the database accepts it.
export const REMOVED_DECREE_NOTICE = "This decree was removed by Nomarchy for breaking the community guidelines.";

const TAG = /\[decree:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i;
const PAGE = /nomarchy\.ca\/r\/([a-z0-9-]+)/i;

export function formatDecreeReport({ slug, username, throneId, reason }) {
  const who = username ? `@${username}` : "a member";
  return `Report on a decree by ${who} at nomarchy.ca/r/${slug} [decree:${throneId}]: ${(reason || "").trim().slice(0, 1000) || "(no reason given)"}`;
}

// { throneId, slug } for a message made by formatDecreeReport, else null.
export function parseDecreeReport(message) {
  const m = typeof message === "string" ? message.match(TAG) : null;
  if (!m) return null;
  return { throneId: m[1].toLowerCase(), slug: message.match(PAGE)?.[1] || null };
}

// The storage path of one of someone's review photos from its public URL,
// only if it sits in that person's own folder.
export function reviewPhotoPath(url, userId) {
  try {
    const path = decodeURIComponent(new URL(url).pathname.split("/review-photos/")[1] || "");
    return path.startsWith(`${userId}/`) && !path.includes("..") ? path : null;
  } catch {
    return null;
  }
}
