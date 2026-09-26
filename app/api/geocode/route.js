// ============================================================
// Turns a browser's GPS coordinates into a city/area name, for the Top 25
// page's "Near me" button.
//
// There's no Google Maps API key anywhere in this app (see app/api/ai's
// lookup mode - restaurant search is Claude web search, not Places), so
// this uses OpenStreetMap's free Nominatim reverse-geocoding service
// instead of adding a second, billed Google API. It has to be called
// server-side: Nominatim's usage policy requires a real User-Agent
// identifying the app, which a browser fetch can't set, and this app's
// CSP only allows the browser to call Supabase anyway.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function supabaseForToken(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

export async function POST(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data } = await supabaseForToken(token).auth.getUser(token);
  if (!data.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { lat, lng } = await request.json();
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "Missing coordinates" }, { status: 400 });
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12&addressdetails=1`;
  const res = await fetch(url, { headers: { "User-Agent": "Nomarchy (nomarchy.ca)" } });
  if (!res.ok) return NextResponse.json({ error: "Couldn't figure out where you are" }, { status: 502 });

  const body = await res.json();
  const a = body.address || {};
  const city = a.city || a.town || a.village || a.suburb || a.neighbourhood || a.county || null;
  if (!city) return NextResponse.json({ error: "Couldn't figure out where you are" }, { status: 502 });

  return NextResponse.json({ city });
}
