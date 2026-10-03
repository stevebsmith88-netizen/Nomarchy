// ============================================================
// Owner-only: search any crowned throne by restaurant name, and correct
// its address, neighbourhood, or cuisine - a bad address baked in at
// crown time (a wrong match from the local dataset or lookup) otherwise
// has no fix path for anyone but the person who crowned it, and they may
// not know it's wrong or be around to ask.
//
// Deliberately narrow: this can NEVER touch decree or photos. Those are
// someone's actual review, not a fact about the restaurant - the owner
// correcting a street address is data cleanup, the owner editing someone
// else's written opinion would be something else entirely. The update
// below only ever writes the three allowed columns, regardless of what
// a request body contains.
//
// Same verify-then-service-role pattern as /api/admin/overview - the
// caller's own is_owner flag is checked via their own token on the
// anon-key client before the service role key (which bypasses RLS
// entirely) is ever used.
// ============================================================

import { NextResponse } from "next/server";
import { requireOwner } from "../../../../lib/requireOwner";

// Same fix as updateThroneLocation in lib/data.js: correcting the address
// text alone never moved the map pin, since that lives in separate
// lat/lng columns. Restricted to Canada for the same reason as
// /api/geocode - an unrestricted search can match a same-named street or
// neighbourhood in the wrong country entirely.
async function geocodeAddress(address) {
  if (!address?.trim()) return { lat: null, lng: null };
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ca&q=${encodeURIComponent(address.trim())}`;
    const res = await fetch(url, { headers: { "User-Agent": "Nomarchy (nomarchy.ca)" } });
    if (!res.ok) return { lat: null, lng: null };
    const results = await res.json();
    if (!results?.[0]) return { lat: null, lng: null };
    return { lat: Number(results[0].lat), lng: Number(results[0].lon) };
  } catch {
    return { lat: null, lng: null };
  }
}

export async function GET(request) {
  const { admin, error } = await requireOwner(request);
  if (error) return error;

  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ results: [] });

  const { data, error: queryErr } = await admin
    .from("thrones")
    .select("id, place_name, address, neighbourhood, cuisine_id, cuisines(name), profiles!thrones_user_id_fkey(username)")
    .ilike("place_name", `%${q}%`)
    .order("place_name")
    .limit(20);
  if (queryErr) return NextResponse.json({ error: queryErr.message }, { status: 500 });

  return NextResponse.json({
    results: data.map((t) => ({
      id: t.id,
      placeName: t.place_name,
      address: t.address,
      neighbourhood: t.neighbourhood,
      cuisineId: t.cuisine_id,
      cuisineName: t.cuisines?.name || null,
      username: t.profiles?.username || null,
    })),
  });
}

export async function PATCH(request) {
  const { admin, error } = await requireOwner(request);
  if (error) return error;

  const { throneId, address, neighbourhood, cuisineId } = await request.json();
  if (!throneId) return NextResponse.json({ error: "Missing throneId" }, { status: 400 });

  // Only ever these columns, named explicitly - never spread the raw
  // body into the update, so a decree or photos field can't ride along.
  const fields = { address: address || null, neighbourhood: neighbourhood || null };
  if (cuisineId) fields.cuisine_id = cuisineId;
  const coords = await geocodeAddress(address);
  if (coords.lat != null && coords.lng != null) {
    fields.lat = coords.lat;
    fields.lng = coords.lng;
  }

  const { data, error: updateErr } = await admin
    .from("thrones")
    .update(fields)
    .eq("id", throneId)
    .select("id, place_name, address, neighbourhood, cuisines(name)")
    .single();
  if (updateErr) {
    if (updateErr.code === "23505") {
      return NextResponse.json({ error: "That user already has a throne in that cuisine" }, { status: 409 });
    }
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ throne: data });
}
