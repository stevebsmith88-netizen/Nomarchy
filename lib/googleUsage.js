// Counts every request our server sends to Google, so Admin can show usage
// before any bill arrives (see google_api_calls and google_usage_summary in
// schema.sql). Written with the service role, never from the browser, so
// the numbers can't be inflated by a signed-in user. Counting must never
// get in the way of the thing being counted: any failure here is swallowed.

import { createClient } from "@supabase/supabase-js";

export async function logGoogleCall(kind, userId = null) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    await createClient(url, key).from("google_api_calls").insert({ kind, user_id: userId });
  } catch {}
}
