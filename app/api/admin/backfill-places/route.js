// ============================================================
// Owner-only, one-time: matches places saved before Google search existed
// (crowns and Next in Line entries with no google_place_id) to their real
// Google place, so each gets a place ID and Google's coordinates.
//
// Two steps, so nothing changes until the owner has seen what was found:
//   POST { mode: "preview", offset }  - searches Google for a batch of
//       unique places and reports what it would do. Writes nothing.
//   POST { mode: "apply", updates }   - saves matches the owner approved.
//
// Apply only ever writes google_place_id, lat and lng, only onto rows that
// still have no google_place_id (so it can never overwrite an existing
// match), and never touches names, addresses, decrees, notes or photos.
//
// Same verify-then-service-role pattern as /api/admin/fix-throne: the
// caller's own is_owner flag is checked via their own token before the
// service role key (which bypasses RLS) is ever used.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchGooglePlaces } from "../../../../lib/googlePlaces";
import { logGoogleCall } from "../../../../lib/googleUsage";
import { decide, groupKey } from "../../../../lib/placeMatch";

export const maxDuration = 60;

const BATCH_SIZE = 12;
const CONCURRENCY = 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACE_ID = /^[A-Za-z0-9_-]{10,200}$/;

async function requireOwner(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: userData } = await anon.auth.getUser(token);
  if (!userData.user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };

  const { data: profile, error: profileErr } = await anon
    .from("profiles")
    .select("is_owner")
    .eq("id", userData.user.id)
    .single();
  if (profileErr || !profile?.is_owner) {
    return { error: NextResponse.json({ error: "Not authorized" }, { status: 403 }) };
  }
  return { admin: createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) };
}

// Every unmatched saved place, grouped so one real-world restaurant is one
// group no matter how many people saved it. Sorted so batches are stable
// from one request to the next.
async function loadGroups(admin) {
  const [thrones, nextInLine] = await Promise.all([
    admin.from("thrones").select("id, place_name, address, neighbourhood, city, lat, lng").is("google_place_id", null),
    admin.from("next_in_line").select("id, place_name, address, neighbourhood, city, lat, lng").is("google_place_id", null),
  ]);
  if (thrones.error) throw thrones.error;
  if (nextInLine.error) throw nextInLine.error;

  const groups = new Map();
  const add = (table, r) => {
    const row = { name: r.place_name, address: r.address, area: r.neighbourhood, city: r.city || "Toronto", lat: r.lat == null ? null : Number(r.lat), lng: r.lng == null ? null : Number(r.lng) };
    const key = groupKey(row);
    const g = groups.get(key) || { key, row, thrones: [], nextInLine: [] };
    // Prefer a row that already has a pin as the group's representative.
    if (g.row.lat == null && row.lat != null) g.row = row;
    g[table].push(r.id);
    groups.set(key, g);
  };
  for (const r of thrones.data) add("thrones", r);
  for (const r of nextInLine.data) add("nextInLine", r);
  return Array.from(groups.values()).sort((a, b) => a.key.localeCompare(b.key));
}

async function inChunks(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

async function preview(admin, offset) {
  const groups = await loadGroups(admin);
  const slice = groups.slice(offset, offset + BATCH_SIZE);

  const checked = await inChunks(slice, CONCURRENCY, async (g) => {
    const results = await searchGooglePlaces(`${g.row.name} ${g.row.address || g.row.area || ""}`.trim(), g.row.city, { onCall: () => logGoogleCall("backfill_search") });
    const base = {
      key: g.key,
      name: g.row.name,
      address: g.row.address || "",
      area: g.row.area || "",
      thrones: g.thrones,
      nextInLine: g.nextInLine,
    };
    if (results === null) return { ...base, status: "error" };
    const verdict = decide(g.row, results);
    return { ...base, ...verdict };
  });

  const next = offset + BATCH_SIZE;
  return { total: groups.length, offset, nextOffset: next < groups.length ? next : null, groups: checked };
}

function validUpdate(u) {
  const ids = (list) => Array.isArray(list) && list.every((id) => typeof id === "string" && UUID.test(id));
  return (
    u &&
    ids(u.thrones || []) &&
    ids(u.nextInLine || []) &&
    typeof u.googlePlaceId === "string" && PLACE_ID.test(u.googlePlaceId) &&
    typeof u.lat === "number" && u.lat >= -90 && u.lat <= 90 &&
    typeof u.lng === "number" && u.lng >= -180 && u.lng <= 180
  );
}

async function apply(admin, updates) {
  if (!Array.isArray(updates) || updates.length === 0 || updates.length > 100 || !updates.every(validUpdate)) {
    return NextResponse.json({ error: "Invalid updates" }, { status: 400 });
  }
  let saved = 0;
  for (const u of updates) {
    const fields = { google_place_id: u.googlePlaceId, lat: u.lat, lng: u.lng };
    for (const [table, ids] of [["thrones", u.thrones || []], ["next_in_line", u.nextInLine || []]]) {
      if (ids.length === 0) continue;
      // .is("google_place_id", null) is the never-overwrite guarantee.
      const { data, error } = await admin.from(table).update(fields).in("id", ids).is("google_place_id", null).select("id");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      saved += data?.length || 0;
    }
  }
  return NextResponse.json({ saved });
}

export async function POST(request) {
  const { admin, error } = await requireOwner(request);
  if (error) return error;
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY isn't set on the server" }, { status: 500 });
  }

  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Bad request" }, { status: 400 }); }

  try {
    if (body.mode === "preview") {
      const offset = Number.isInteger(body.offset) && body.offset >= 0 ? body.offset : 0;
      return NextResponse.json(await preview(admin, offset));
    }
    if (body.mode === "apply") return await apply(admin, body.updates);
    return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Something went wrong" }, { status: 500 });
  }
}
