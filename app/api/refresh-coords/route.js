// ============================================================
// Daily job (see vercel.json): re-confirms the stored map coordinates for
// places that have a Google place ID, because Google's terms only allow
// keeping coordinates for about 30 days. The logic lives in
// lib/coordRefresh.js; this is just the door to it.
//
// Same guard as /api/reengage/send (lib/cronAuth.js): Vercel Cron sends the
// CRON_SECRET as a bearer token, and without it the request is refused.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { refreshCoords } from "@/lib/coordRefresh";
import { logGoogleCall } from "@/lib/googleUsage";
import { isCronAuthorized } from "@/lib/cronAuth";

export const maxDuration = 60;

export async function GET(request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY isn't set on the server" }, { status: 500 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  try {
    const summary = await refreshCoords(admin, { apiKey, onCall: () => logGoogleCall("place_refresh") });
    return NextResponse.json(summary);
  } catch (err) {
    console.error("Coordinate refresh failed", err?.message);
    return NextResponse.json({ error: "Refresh failed" }, { status: 500 });
  }
}
