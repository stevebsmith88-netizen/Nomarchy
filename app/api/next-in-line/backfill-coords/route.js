// ============================================================
// One-time (or repeatable) backfill: finds next_in_line rows - across ALL
// users, same as the thrones backfill - missing lat/lng and fills them in,
// for the Next in Line map view.
//
// Two strategies, tried in order:
// 1. Match the name against the local Toronto restaurants table (the
//    match_restaurant() function - same one importToNextInLine now uses
//    going forward). Free and instant, no rate limit, and more reliable
//    than guessing since it's real curated data - covers most rows, since
//    most entries here came from a bulk import with no address at all.
// 2. Otherwise fall back to Nominatim: the row's own address if it has
//    one, else "name, neighbourhood, city", less precise but still better
//    than nothing.
//
// Not triggered by app code - visit this URL yourself with the same
// secret used for the restaurant import. Nominatim's usage policy caps
// requests at roughly 1/second, and Vercel's function has a 60s ceiling,
// so this only processes a batch per visit (~45 rows) rather than
// everything at once - safe to just revisit the same URL again, since it
// only ever looks at rows still missing coordinates. Rows resolved via
// the local table skip the delay entirely, since they never call Nominatim.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const BATCH_SIZE = 45;
const DELAY_MS = 1100;

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Nomarchy (nomarchy.ca)" } });
  if (!res.ok) return null;
  const results = await res.json();
  if (!results?.[0]) return null;
  return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
}

export async function GET(request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!process.env.RESTAURANT_IMPORT_SECRET || key !== process.env.RESTAURANT_IMPORT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = admin();
  const { data: rows, error } = await supabase
    .from("next_in_line")
    .select("id, address, place_name, neighbourhood")
    .is("lat", null)
    .limit(BATCH_SIZE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0, failed = 0;
  for (const row of rows) {
    const { data: matches, error: matchErr } = await supabase.rpc("match_restaurant", { search_name: row.place_name });
    const match = matchErr ? null : matches?.[0];

    let coords = match?.lat && match?.lng ? { lat: match.lat, lng: match.lng } : null;
    if (!coords) {
      const query = row.address || match?.address
        || [row.place_name, row.neighbourhood, "Toronto"].filter(Boolean).join(", ");
      coords = await geocode(query);
      await sleep(DELAY_MS);
    }

    if (coords) {
      const { error: updErr } = await supabase.from("next_in_line").update(coords).eq("id", row.id);
      if (updErr) failed += 1; else updated += 1;
    } else {
      failed += 1;
    }
  }

  return NextResponse.json({ updated, failed, remainingAtLeast: rows.length === BATCH_SIZE ? "more - revisit this URL" : 0 });
}
