// ============================================================
// Weekly "most crowned near you" digest.
//
// Triggered by Vercel Cron (see vercel.json) once a week. Vercel signs
// its own cron requests with the CRON_SECRET env var as a bearer token
// when that var is set - this route just has to check it matches, so a
// stranger can't trigger a mass email by guessing the URL.
//
// City-scoped on purpose: someone in Calgary has no use for Toronto's
// most-crowned list, so each recipient only ever sees crowns from other
// users who share their own profile.city (exact, case-insensitive match -
// there's no real geocoding in this app, see app/api/geocode for why).
// Only pulls from public profiles, same privacy rule as everywhere else.
// Sends nothing to a city with no new crowns that week rather than
// mailing an empty digest.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { groupCrownedThrones } from "@/lib/data";

const SENDGRID_FROM = process.env.DIGEST_FROM_EMAIL || "hello@nomarchy.ca";
const SITE_URL = "https://nomarchy.ca";
const MAX_ITEMS = 3;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function listAllUsers(supabase) {
  const emails = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) if (u.email) emails.set(u.id, u.email);
    if (data.users.length < 200) break;
    page += 1;
  }
  return emails;
}

function renderEmail({ displayName, cityLabel, items, unsubscribeUrl }) {
  const rows = items
    .map(
      (p) => `
        <tr>
          <td style="padding:12px 0;border-top:1px solid #eee;">
            <div style="font-size:16px;font-weight:700;color:#1C1326;">${p.name}</div>
            <div style="font-size:13px;color:#666;margin-top:2px;">
              ${[p.area, p.rating ? `★ ${p.rating}` : null].filter(Boolean).join(" · ")}
              &nbsp;·&nbsp; crowned by ${p.count} ${p.count === 1 ? "person" : "people"}
            </div>
          </td>
        </tr>`
    )
    .join("");

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
    <div style="font-size:20px;font-weight:900;letter-spacing:2px;color:#1C1326;">NOMARCHY</div>
    <p style="font-size:14px;color:#666;margin-top:4px;">Most crowned in ${cityLabel} this week</p>
    <p style="font-size:14px;color:#333;">Hi ${displayName},</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <p style="margin-top:24px;">
      <a href="${SITE_URL}" style="background:#E3B341;color:#1C1326;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;font-size:14px;">Open Nomarchy</a>
    </p>
    <p style="margin-top:32px;font-size:11px;color:#999;">
      You're getting this because you're signed up for Nomarchy in ${cityLabel}.
      <a href="${unsubscribeUrl}" style="color:#999;">Unsubscribe from this weekly email</a>.
    </p>
  </div>`;
}

async function sendEmail(to, subject, html) {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: SENDGRID_FROM, name: "Nomarchy" },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
}

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.SENDGRID_API_KEY) {
    return NextResponse.json({ error: "SENDGRID_API_KEY not configured" }, { status: 500 });
  }

  const supabase = admin();

  const [profilesRes, emails] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, city, is_public, digest_opt_out, unsubscribe_token"),
    listAllUsers(supabase),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  const profiles = profilesRes.data;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: thrones, error: thronesErr } = await supabase
    .from("thrones")
    .select("user_id, place_name, address, neighbourhood, rating, maps_url, crowned_at")
    .gte("crowned_at", since);
  if (thronesErr) throw thronesErr;

  const publicCityByUser = new Map(
    profiles.filter((p) => p.is_public && p.city).map((p) => [p.id, p.city.trim().toLowerCase()])
  );

  const rowsByCity = new Map();
  for (const t of thrones) {
    const city = publicCityByUser.get(t.user_id);
    if (!city) continue;
    if (!rowsByCity.has(city)) rowsByCity.set(city, []);
    rowsByCity.get(city).push(t);
  }

  const topByCity = new Map();
  for (const [city, rows] of rowsByCity) {
    topByCity.set(city, groupCrownedThrones(rows).slice(0, MAX_ITEMS));
  }

  let sent = 0, skipped = 0, failed = 0;
  await Promise.allSettled(
    profiles
      .filter((p) => !p.digest_opt_out && p.city)
      .map(async (p) => {
        const email = emails.get(p.id);
        const items = topByCity.get(p.city.trim().toLowerCase());
        if (!email || !items || items.length === 0) {
          skipped += 1;
          return;
        }
        try {
          const html = renderEmail({
            displayName: p.display_name || p.username,
            cityLabel: p.city,
            items,
            unsubscribeUrl: `${SITE_URL}/api/digest/unsubscribe?token=${p.unsubscribe_token}`,
          });
          await sendEmail(email, `This week's most crowned in ${p.city}`, html);
          sent += 1;
        } catch {
          failed += 1;
        }
      })
  );

  return NextResponse.json({ sent, skipped, failed });
}
