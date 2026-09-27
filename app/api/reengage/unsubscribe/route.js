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
     <body style="font-family:Arial,Helvetica,sans-serif;max-width:420px;margin:80px auto;padding:0 20px;text-align:center;color:#1C1326;">
       <div style="font-size:18px;font-weight:900;letter-spacing:2px;">NOMARCHY</div>
       <p style="margin-top:16px;">${message}</p>
     </body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );
}

export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return page("Missing unsubscribe link. Nothing changed.");

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { error } = await supabase
    .from("profiles")
    .update({ reminders_opt_out: true })
    .eq("unsubscribe_token", token);

  if (error) return page("Something went wrong - try the toggle in your profile settings instead.");
  return page("You're unsubscribed from inactivity reminders. You can turn them back on any time from your profile in the app.");
}
