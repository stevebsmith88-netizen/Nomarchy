// ============================================================
// Daily job (see vercel.json): re-confirms the stored map coordinates for
// places that have a Google place ID, because Google's terms only allow
// keeping coordinates for about 30 days. The logic lives in
// lib/coordRefresh.js; this is just the door to it.
//
// Same guard as /api/reengage/send: Vercel Cron sends the CRON_SECRET as a
// bearer token. Anyone calling this by hand can only ever trigger work that
// is already due (a place refreshed today is not due again for 20 days),
// capped per run, so the worst case is bounded.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { refreshCoords } from "@/lib/coordRefresh";
import { logGoogleCall } from "@/lib/googleUsage";

export const maxDuration = 60;

export async function GET(request) {
  const auth = request.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
