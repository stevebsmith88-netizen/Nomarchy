// ============================================================
// Two geocoding directions, both backed by OpenStreetMap's free Nominatim
// service rather than a paid Google API (see app/api/ai's lookup mode for
// why there's no Google Places key anywhere in this app):
//
//   mode: "reverse" (default) - GPS coordinates -> a city/area name, for
//   the Trending tab's "Near me" button.
//   mode: "forward" - a street address -> {lat, lng}, so a crowned pick
//   gets real coordinates for the Kingdom map view even when it came from
//   Claude's web search (which returns an address, never coordinates).
//
// Both have to be called server-side: Nominatim's usage policy requires
// a real User-Agent identifying the app, which a browser fetch can't
// set, and this app's CSP only allows the browser to call Supabase anyway.
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

  const body = await request.json();

  if (body.mode === "forward") {
    if (!body.address?.trim()) return NextResponse.json({ error: "Missing address" }, { status: 400 });
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(body.address.trim())}`;
    const res = await fetch(url, { headers: { "User-Agent": "Nomarchy (nomarchy.ca)" } });
    if (!res.ok) return NextResponse.json({ error: "Couldn't locate that address" }, { status: 502 });
    const results = await res.json();
    if (!results?.[0]) return NextResponse.json({ error: "Couldn't locate that address" }, { status: 502 });
    return NextResponse.json({ lat: Number(results[0].lat), lng: Number(results[0].lon) });
  }

  const { lat, lng } = body;
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "Missing coordinates" }, { status: 400 });
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12&addressdetails=1`;
  const res = await fetch(url, { headers: { "User-Agent": "Nomarchy (nomarchy.ca)" } });
  if (!res.ok) return NextResponse.json({ error: "Couldn't figure out where you are" }, { status: 502 });

  const revBody = await res.json();
  const a = revBody.address || {};
  const city = a.city || a.town || a.village || a.suburb || a.neighbourhood || a.county || null;
  if (!city) return NextResponse.json({ error: "Couldn't figure out where you are" }, { status: 502 });

  return NextResponse.json({ city });
}
