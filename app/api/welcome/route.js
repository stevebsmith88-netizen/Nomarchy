// ============================================================
// Sends a one-time welcome email once someone finishes the "pick a
// username" onboarding step (WelcomeModal in app/page.js), not at the raw
// moment their account row is created - at creation they're still showing
// a random placeholder username and may not have verified their email yet.
//
// Triggered by a Supabase Database Webhook (Database -> Webhooks -> On
// UPDATE to "profiles" -> this URL), not by app code. The onboarded=false
// -> true guard below means an Insert event would also safely no-op here
// if one's still configured, and a later unrelated profile edit (avatar,
// discoverable, etc.) won't re-send it. The webhook's custom header is
// what stops a stranger from POSTing here directly to spam the sender.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SENDGRID_FROM = process.env.DIGEST_FROM_EMAIL || "hello@nomarchy.ca";
const SITE_URL = "https://nomarchy.ca";
// Optional - only shown in the footer if set. CASL/CAN-SPAM expect a real
// mailing address on messages like this; set this in Vercel if you want
// it included (Settings -> Environment Variables -> MAILING_ADDRESS).
const MAILING_ADDRESS = process.env.MAILING_ADDRESS || "";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function renderEmail(name) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;border:1px solid #eee;border-radius:12px;overflow:hidden;">
    <div style="background:#1D1326;padding:32px 24px;text-align:center;">
      <img src="${SITE_URL}/icon-512.png" width="56" height="56" alt="Nomarchy" style="display:block;margin:0 auto;border-radius:12px;" />
      <div style="font-size:20px;font-weight:900;letter-spacing:3px;color:#E2B340;margin-top:10px;">NOMARCHY</div>
    </div>
    <div style="padding:24px;">
      <p style="font-size:18px;font-weight:700;color:#1D1326;margin-top:0;">Your kingdom awaits, ${name}.</p>
      <p style="font-size:14px;color:#333;line-height:1.6;">
        Nomarchy is where you crown your favourite restaurant in every cuisine, stage a coup when
        something better comes along, and compare your kingdom with friends.
      </p>
      <!-- Rank title and the 30-point threshold below are duplicated from
           RANKS in app/theme.js (a client-only file, so not imported here) -
           keep these two literals in sync if that ladder's bottom tier ever
           changes. -->
      <div style="margin-top:20px;padding:14px 16px;background:#F5ECDE;border-radius:10px;">
        <p style="font-size:11px;font-weight:700;color:#684F3F;letter-spacing:1px;text-transform:uppercase;margin:0;">Your starting rank</p>
        <p style="font-size:16px;font-weight:900;color:#1D1326;margin:4px 0 0;">Peckish Peasant <span style="font-weight:400;color:#684F3F;font-size:13px;">- 0 taste credibility</span></p>
        <p style="font-size:12px;color:#684F3F;margin:4px 0 0;">30 points to Court Taster, your first promotion.</p>
      </div>
      <p style="margin-top:20px;">
        <a href="${SITE_URL}" style="background:#E2B340;color:#1D1326;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;font-size:14px;">Crown your first pick</a>
      </p>
      <p style="font-size:14px;color:#333;line-height:1.6;margin-top:24px;">Three things worth doing first - each is a Conquest, a one-time bonus toward your rank:</p>
      <ul style="font-size:14px;color:#333;line-height:1.8;padding-left:20px;">
        <li><strong>Crown your first pick</strong> in Kingdom - it just needs a real place and a real reason. <span style="color:#A67C1E;font-weight:700;">First Blood, +5</span></li>
        <li><strong>Follow 3 friends</strong> by username in Court, or find people to follow directly. <span style="color:#A67C1E;font-weight:700;">Build Your Court, +8</span></li>
        <li><strong>Write more than 100 words</strong> when you crown something - say why it actually earned the throne. <span style="color:#A67C1E;font-weight:700;">Say Something, +8</span></li>
      </ul>
      <p style="font-size:13px;color:#333;line-height:1.6;">Already keep a list of favourites in Notes or a spreadsheet? Paste the whole thing into <strong>Next in Line</strong>'s Import a list and it'll sort it out.</p>
      <div style="margin-top:20px;padding-top:20px;border-top:1px solid #eee;">
        <p style="font-size:13px;font-weight:700;color:#1D1326;margin-bottom:6px;">Nomarchy works best added to your home screen</p>
        <p style="font-size:13px;color:#333;line-height:1.7;margin-top:0;">
          <strong>iPhone:</strong> open this in Safari, tap the Share icon, then "Add to Home Screen".<br/>
          <strong>Android:</strong> open this in Chrome, tap the &#8942; menu, then "Add to Home screen" (or "Install app").
        </p>
      </div>
      <p style="margin-top:20px;font-size:13px;color:#333;">Got feedback, or found something broken? Just reply to this email.</p>
      <p style="margin-top:8px;font-size:13px;color:#333;">Curious how it all works? <a href="${SITE_URL}/faq" style="color:#333;text-decoration:underline;">Read the FAQ</a>.</p>
      <p style="margin-top:8px;font-size:13px;color:#333;">Follow along on Instagram: <a href="https://www.instagram.com/nomarchyapp" style="color:#333;text-decoration:underline;">@nomarchyapp</a>.</p>
    </div>
    <p style="font-size:11px;color:#999;padding:0 24px 24px;">
      Sent once, when you join. No recurring emails from us.${MAILING_ADDRESS ? `<br/>Nomarchy, ${MAILING_ADDRESS}` : ""}
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

export async function POST(request) {
  if (request.headers.get("x-webhook-secret") !== process.env.WELCOME_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.SENDGRID_API_KEY) {
    return NextResponse.json({ error: "SENDGRID_API_KEY not configured" }, { status: 500 });
  }

  const body = await request.json();
  const record = body.record;
  const oldRecord = body.old_record;
  if (!record?.id) return NextResponse.json({ error: "No profile row in payload" }, { status: 400 });

  // Fire only on the onboarded false -> true transition, so this is a no-op
  // on the initial account-creation row (always onboarded=false) and on any
  // later, unrelated profile edit (already onboarded=true both before and after).
  if (!record.onboarded || oldRecord?.onboarded) {
    return NextResponse.json({ skipped: true });
  }

  const supabase = admin();
  const { data, error } = await supabase.auth.admin.getUserById(record.id);
  if (error || !data.user?.email) {
    return NextResponse.json({ error: "Couldn't find that user's email" }, { status: 404 });
  }

  await sendEmail(
    data.user.email,
    "Welcome to Nomarchy",
    renderEmail(record.display_name || `@${record.username}`)
  );

  return NextResponse.json({ sent: true });
}
