// ============================================================
// Monthly re-engagement nudge - emails anyone who's gone quiet for 30+
// days, on EITHER signal: no sign-in in that window, OR nothing new
// crowned/added in that window. Either one alone qualifies (that's a
// deliberate choice, not an oversight - someone who signs in often but
// hasn't added anything new still gets a "come add something" nudge).
//
// Triggered by Vercel Cron (see vercel.json), once a month. Skips anyone
// whose account itself is under 30 days old, so a brand new signup never
// gets an inactivity nudge before they've had a real chance to use it.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SENDGRID_FROM = process.env.DIGEST_FROM_EMAIL || "hello@nomarchy.ca";
const SITE_URL = "https://nomarchy.ca";
const QUIET_MS = 30 * 24 * 60 * 60 * 1000;
// Optional - only shown in the footer if set. CASL/CAN-SPAM expect a real
// mailing address on messages like this; set this in Vercel if you want
// it included (Settings -> Environment Variables -> MAILING_ADDRESS).
const MAILING_ADDRESS = process.env.MAILING_ADDRESS || "";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function listAllUsers(supabase) {
  const users = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) users.set(u.id, { email: u.email, lastSignInAt: u.last_sign_in_at });
    if (data.users.length < 200) break;
    page += 1;
  }
  return users;
}

// Recent, notable features worth resurfacing to someone who's been away
// long enough to have missed all of them - update this by hand as things
// ship, same idea as ANNOUNCEMENTS in lib/data.js but kept separate since
// this is a server-only route and that file spins up a client on import.
const WHATS_NEW = [
  { title: "Light mode", desc: "toggle it in your profile settings." },
  { title: "Google Sign-In", desc: "one tap, no password to remember." },
  { title: "Best in the Land", desc: "the most-crowned restaurants across everyone's kingdoms, or just your Court." },
  { title: "The Map", desc: "your friends' picks laid out geographically." },
];

function renderEmail({ name, unsubscribeUrl, friendCrownCount }) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden;">
    <div style="background:#1D1326;padding:32px 24px;text-align:center;">
      <img src="${SITE_URL}/icon-512.png" width="56" height="56" alt="Nomarchy" style="display:block;margin:0 auto;border-radius:12px;" />
      <div style="font-size:20px;font-weight:900;letter-spacing:3px;color:#E2B340;margin-top:10px;">NOMARCHY</div>
    </div>
    <div style="padding:24px;">
      <p style="font-size:16px;color:#1D1326;margin-top:0;">Your kingdom&rsquo;s been quiet, ${name}.</p>
      ${friendCrownCount > 0 ? `
      <div style="margin-top:14px;padding:14px 16px;background:#F5ECDE;border-radius:10px;">
        <p style="font-size:14px;color:#1D1326;margin:0;">
          <strong>${friendCrownCount} new pick${friendCrownCount === 1 ? "" : "s"}</strong> from your Court since you've been away.
        </p>
      </div>` : ""}
      <p style="font-size:14px;color:#333;line-height:1.6;margin-top:16px;">
        It's been a while since you signed in or crowned somewhere new. Your friends' picks are still
        waiting to be endorsed, and there's probably a new favourite spot worth adding.
      </p>
      <p style="margin-top:24px;">
        <a href="${SITE_URL}" style="background:#E2B340;color:#1D1326;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;font-size:14px;">Open Nomarchy</a>
      </p>
      <div style="margin-top:24px;padding-top:20px;border-top:1px solid #eee;">
        <p style="font-size:13px;font-weight:700;color:#1D1326;margin-bottom:8px;">So much has changed since you last looked:</p>
        <ul style="font-size:13px;color:#333;line-height:1.8;padding-left:20px;margin:0;">
          ${WHATS_NEW.map((f) => `<li><strong>${f.title}</strong> - ${f.desc}</li>`).join("")}
        </ul>
      </div>
    </div>
    <p style="font-size:11px;color:#999;padding:0 24px 24px;">
      You're getting this because your Nomarchy account has been quiet for a while.
      <a href="${unsubscribeUrl}" style="color:#999;">Turn off these reminders</a>.${MAILING_ADDRESS ? `<br/>Nomarchy, ${MAILING_ADDRESS}` : ""}
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
  const cutoff = new Date(Date.now() - QUIET_MS).toISOString();

  const [profilesRes, users, thronesRes, nilRes, followsRes] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, created_at, reminders_opt_out, unsubscribe_token"),
    listAllUsers(supabase),
    supabase.from("thrones").select("user_id, crowned_at"),
    supabase.from("next_in_line").select("user_id, added_at"),
    supabase.from("follows").select("follower_id, followee_id"),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (thronesRes.error) throw thronesRes.error;
  if (nilRes.error) throw nilRes.error;
  if (followsRes.error) throw followsRes.error;

  // Who each person follows, so the "X new picks from your Court" line
  // below can count only crowns from people they actually follow, not
  // every crown app-wide.
  const followingMap = new Map();
  for (const f of followsRes.data) {
    if (!followingMap.has(f.follower_id)) followingMap.set(f.follower_id, new Set());
    followingMap.get(f.follower_id).add(f.followee_id);
  }

  const lastActivity = new Map();
  const bump = (userId, at) => {
    const t = new Date(at).getTime();
    if (!lastActivity.has(userId) || t > lastActivity.get(userId)) lastActivity.set(userId, t);
  };
  for (const t of thronesRes.data) bump(t.user_id, t.crowned_at);
  for (const n of nilRes.data) bump(n.user_id, n.added_at);

  const cutoffMs = new Date(cutoff).getTime();
  let sent = 0, skipped = 0, failed = 0;

  await Promise.allSettled(
    profilesRes.data
      .filter((p) => !p.reminders_opt_out && new Date(p.created_at).getTime() < cutoffMs)
      .map(async (p) => {
        const user = users.get(p.id);
        if (!user?.email) { skipped += 1; return; }

        const lastSignInMs = user.lastSignInAt ? new Date(user.lastSignInAt).getTime() : 0;
        const lastActivityMs = lastActivity.get(p.id) || 0;
        const quiet = lastSignInMs < cutoffMs || lastActivityMs < cutoffMs;
        if (!quiet) { skipped += 1; return; }

        try {
          const followedIds = followingMap.get(p.id) || new Set();
          const friendCrownCount = thronesRes.data.filter(
            (t) => followedIds.has(t.user_id) && new Date(t.crowned_at).getTime() > lastSignInMs
          ).length;
          const html = renderEmail({
            name: p.display_name || p.username,
            unsubscribeUrl: `${SITE_URL}/api/reengage/unsubscribe?token=${p.unsubscribe_token}`,
            friendCrownCount,
          });
          await sendEmail(user.email, "Your kingdom's been quiet", html);
          sent += 1;
        } catch {
          failed += 1;
        }
      })
  );

  return NextResponse.json({ sent, skipped, failed });
}
