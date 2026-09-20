// ============================================================
// Deletes the calling user's own account, permanently.
//
// The anon key can never do this - deleting a row from auth.users requires
// the service role key, which must never reach the browser. This route is
// the only place that key is used, and only after verifying (via the
// caller's own token, on the anon-key client) which user is asking - never
// trusting a user id passed in the request body.
//
// The actual data cleanup is just deleting the auth.users row: every table
// that references profiles(id) does so with `on delete cascade`, and
// profiles itself cascades from auth.users, so one deletion here removes
// everything - thrones, fallen, next_in_line, endorsements, follows,
// ai_calls - with no manual cleanup needed.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { error } = await admin.auth.admin.deleteUser(data.user.id);
  if (error) {
    return NextResponse.json({ error: "Couldn't delete your account" }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
