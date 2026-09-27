// ============================================================
// Sends a one-time welcome email the moment a new profiles row appears -
// which happens for every new signup regardless of how they signed up
// (email code or Google), since both paths run through the same
// handle_new_user() trigger in schema.sql. That single shared moment is
// what makes this provider-agnostic, unlike Supabase's own auth emails,
// which only fire for the email-code flow.
//
// Triggered by a Supabase Database Webhook (Database -> Webhooks -> On
// INSERT to "profiles" -> this URL), not by app code - see the setup
// steps given alongside this file. The webhook's custom header is what
// stops a stranger from POSTing here directly to spam the sender.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SENDGRID_FROM = process.env.DIGEST_FROM_EMAIL || "hello@nomarchy.ca";
const SITE_URL = "https://nomarchy.ca";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function renderEmail({ name }) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
    <div style="font-size:20px;font-weight:900;letter-spacing:2px;color:#1C1326;">NOMARCHY</div>
    <p style="font-size:16px;color:#1C1326;margin-top:20px;">Welcome, ${name} - your kingdom awaits.</p>
    <p style="font-size:14px;color:#333;line-height:1.6;">
      Nomarchy is where you crown your favourite restaurant in every cuisine, stage a coup when
      something better comes along, and compare your kingdom with friends.
    </p>
    <p style="font-size:14px;color:#333;line-height:1.6;">A few things to try first:</p>
    <ul style="font-size:14px;color:#333;line-height:1.8;padding-left:20px;">
      <li>Crown your first pick in <strong>Kingdom</strong> - it just needs a real place and a real reason.</li>
      <li>Follow a friend by username in <strong>Court</strong>, or find people to follow directly.</li>
      <li>Add the places you keep meaning to try to <strong>Next in Line</strong>.</li>
    </ul>
    <p style="margin-top:24px;">
      <a href="${SITE_URL}" style="background:#E3B341;color:#1C1326;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:700;font-size:14px;">Open Nomarchy</a>
    </p>
    <p style="margin-top:32px;font-size:11px;color:#999;">
      You're getting this because you just created a Nomarchy account. This is a one-time welcome,
      not a recurring email.
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
  if (!record?.id) return NextResponse.json({ error: "No profile row in payload" }, { status: 400 });

  const supabase = admin();
  const { data, error } = await supabase.auth.admin.getUserById(record.id);
  if (error || !data.user?.email) {
    return NextResponse.json({ error: "Couldn't find that user's email" }, { status: 404 });
  }

  await sendEmail(
    data.user.email,
    "Welcome to Nomarchy",
    renderEmail({ name: record.display_name || record.username })
  );

  return NextResponse.json({ sent: true });
}
