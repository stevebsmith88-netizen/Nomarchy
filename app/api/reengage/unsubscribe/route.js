// ============================================================
// One-click unsubscribe from inactivity reminders, reachable straight
// from the email with no sign-in - same random-token pattern as the
// welcome email would use, distinct from the person's actual account id
// (see schema.sql: profiles.unsubscribe_token).
// ============================================================

import { createClient } from "@supabase/supabase-js";

function page(message) {
  return new Response(
    `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
     <body style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:80px auto;padding:0 20px;text-align:center;color:#1D1326;">
       <div style="font-size:18px;font-weight:900;letter-spacing:2px;">NOMARCHY</div>
       <p style="margin-top:16px;">${message}</p>
     </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function unsubscribe(token) {
  if (!token || !UUID.test(token)) return "missing";
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase
    .from("profiles")
    .update({ reminders_opt_out: true })
    .eq("unsubscribe_token", token);
  return error ? "error" : "ok";
}

export async function GET(request) {
  const result = await unsubscribe(new URL(request.url).searchParams.get("token"));
  if (result === "missing") return page("Missing unsubscribe link. Nothing changed.");
  if (result === "error") return page("Something went wrong - try the toggle in your profile settings instead.");
  return page("You're unsubscribed from inactivity reminders. You can turn them back on any time from your profile in the app.");
}

// Mail apps' own "Unsubscribe" button (the List-Unsubscribe-Post header on
// the reminder email) sends a POST to the same link.
export async function POST(request) {
  const result = await unsubscribe(new URL(request.url).searchParams.get("token"));
  return new Response(null, { status: result === "ok" ? 200 : 400 });
}
