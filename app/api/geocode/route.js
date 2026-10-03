// ============================================================
// Two geocoding directions, both backed by OpenStreetMap's free Nominatim
// service rather than a paid Google API (place search itself uses Google,
// which returns coordinates directly - this covers everything else):
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

// Nominatim can be slow; give up rather than hold the request open.
const TIMEOUT_MS = 8000;
const nominatim = (url) => fetch(url, { headers: { "User-Agent": "Nomarchy (nomarchy.ca)" }, signal: AbortSignal.timeout(TIMEOUT_MS) });

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

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Bad request" }, { status: 400 });

  if (body.mode === "forward") {
    if (typeof body.address !== "string" || !body.address.trim()) return NextResponse.json({ error: "Missing address" }, { status: 400 });
    // Appending the known city is what actually makes this reliable
    // anywhere - "1391 Queen St W, Toronto" can't collide with a
    // same-named street elsewhere, where a bare street address
    // sometimes can (that's what put a Toronto pick in San Diego).
    // countrycodes=ca is just a backstop for the rarer case there's no
    // city to work with - revisit that default once a non-Canadian city
    // gets added, since city context alone should carry most cases.
    const address = String(body.address).trim().slice(0, 300);
    const city = typeof body.city === "string" ? body.city.trim().slice(0, 100) : "";
    const query = city ? `${address}, ${city}` : address;
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q=${encodeURIComponent(query)}`;
    const res = await nominatim(url).catch(() => null);
    if (!res?.ok) return NextResponse.json({ error: "Couldn't locate that address" }, { status: 502 });
    const results = await res.json();
    if (!results?.[0]) return NextResponse.json({ error: "Couldn't locate that address" }, { status: 502 });
    return NextResponse.json({ lat: Number(results[0].lat), lng: Number(results[0].lon) });
  }

  const { lat, lng } = body;
  if (typeof lat !== "number" || typeof lng !== "number" || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Missing coordinates" }, { status: 400 });
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12&addressdetails=1`;
  const res = await nominatim(url).catch(() => null);
  if (!res?.ok) return NextResponse.json({ error: "Couldn't figure out where you are" }, { status: 502 });

  const revBody = await res.json();
  const a = revBody.address || {};
  const city = a.city || a.town || a.village || a.suburb || a.neighbourhood || a.county || null;
  if (!city) return NextResponse.json({ error: "Couldn't figure out where you are" }, { status: 502 });

  return NextResponse.json({ city });
}
