// Guards the scheduled-job routes. Vercel Cron sends the CRON_SECRET
// environment variable as a bearer token. Unlike before, a missing secret
// no longer means "open to everyone": with no CRON_SECRET configured the
// jobs refuse every request (and say why in the server logs), so the
// worst a misconfiguration can do is a job that doesn't run - which shows
// up straight away - never a job anyone on the internet can trigger.

import { timingSafeEqual } from "node:crypto";

export function isCronAuthorized(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("CRON_SECRET is not set - refusing to run a scheduled job");
    return false;
  }
  const given = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
