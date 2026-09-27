// ============================================================
// One-time (or repeatable) backfill: finds next_in_line rows - across ALL
// users, same as the thrones backfill - missing lat/lng (anything added
// before geocode-on-save existed) and geocodes their address via
// Nominatim, for the Next in Line map view.
//
// Not triggered by app code - visit this URL yourself with the same
// secret used for the restaurant import. Nominatim's usage policy caps
// requests at roughly 1/second, and Vercel's function has a 60s ceiling,
// so this only processes a batch per visit (~45 rows) rather than
// everything at once - safe to just revisit the same URL again, since it
// only ever looks at rows still missing coordinates.
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

async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
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
    .select("id, address")
    .is("lat", null)
    .not("address", "is", null)
    .limit(BATCH_SIZE);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let updated = 0, failed = 0;
  for (const row of rows) {
    const coords = await geocode(row.address);
    if (coords) {
      const { error: updErr } = await supabase.from("next_in_line").update(coords).eq("id", row.id);
      if (updErr) failed += 1; else updated += 1;
    } else {
      failed += 1;
    }
    await sleep(DELAY_MS);
  }

  return NextResponse.json({ updated, failed, remainingAtLeast: rows.length === BATCH_SIZE ? "more - revisit this URL" : 0 });
}
