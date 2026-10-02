// Counts one Google map load for the signed-in caller, so Admin's Google
// usage table can show the charge that grows with traffic. Needs a valid
// sign-in (a stranger can't run the number up), and does nothing else -
// no data comes back, and a failure here never matters to the map.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logGoogleCall } from "../../../../lib/googleUsage";

export async function POST(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data } = await anon.auth.getUser(token);
  if (!data.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  await logGoogleCall("map_load", data.user.id);
  return NextResponse.json({ ok: true });
}
