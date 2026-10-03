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
// Apply only ever acts on rows that still have no google_place_id (so it can
// never overwrite an existing match). It sets google_place_id, lat and lng,
// and fills in address, neighbourhood, city, map link - and, for Next in
// Line entries with no cuisine, a cuisine suggested from Google's category -
// but ONLY where that field is currently blank. It never changes a name, a
// decree, a note, a photo, or anything a person already filled in.
//
// Same verify-then-service-role pattern as /api/admin/fix-throne: the
// caller's own is_owner flag is checked via their own token before the
// service role key (which bypasses RLS) is ever used.
// ============================================================

import { NextResponse } from "next/server";
import { fetchPlaceDetails, searchGooglePlaces } from "../../../../lib/googlePlaces";
import { planFill } from "../../../../lib/placeDetails";
import { logGoogleCall } from "../../../../lib/googleUsage";
import { decide, groupKey } from "../../../../lib/placeMatch";
import { requireOwner } from "../../../../lib/requireOwner";
import { safeMapsUrl } from "../../../../lib/safeUrl";

export const maxDuration = 60;

const BATCH_SIZE = 12;
const CONCURRENCY = 4;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLACE_ID = /^[A-Za-z0-9_-]{10,200}$/;

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
      city: g.row.city,
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

const optionalText = (v, max) => v === undefined || v === null || (typeof v === "string" && v.length <= max);

// ---- "details" mode: places that already have a Google ID but blank fields ----

const DETAILS_BATCH = 25;
const BLANK_FILTER = "address.is.null,neighbourhood.is.null,city.is.null,maps_url.is.null";

async function loadDetailGroups(admin) {
  const [thrones, nextInLine] = await Promise.all([
    admin.from("thrones").select("id, google_place_id, place_name, address, neighbourhood, city, maps_url").not("google_place_id", "is", null).or(BLANK_FILTER),
    admin.from("next_in_line").select("id, google_place_id, place_name, address, neighbourhood, city, maps_url, cuisine_id").not("google_place_id", "is", null).or(`${BLANK_FILTER},cuisine_id.is.null`),
  ]);
  if (thrones.error) throw thrones.error;
  if (nextInLine.error) throw nextInLine.error;
  const groups = new Map();
  for (const [table, rows] of [["thrones", thrones.data], ["next_in_line", nextInLine.data]]) {
    for (const r of rows) {
      const g = groups.get(r.google_place_id) || { googlePlaceId: r.google_place_id, name: r.place_name, rows: [] };
      g.rows.push({ ...r, table });
      groups.set(r.google_place_id, g);
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.googlePlaceId.localeCompare(b.googlePlaceId));
}

async function detailsPreview(admin, offset) {
  const groups = await loadDetailGroups(admin);
  const slice = groups.slice(offset, offset + DETAILS_BATCH);
  const checked = await inChunks(slice, CONCURRENCY, async (g) => {
    const base = {
      googlePlaceId: g.googlePlaceId, name: g.name,
      thrones: g.rows.filter((r) => r.table === "thrones").map((r) => r.id),
      nextInLine: g.rows.filter((r) => r.table === "next_in_line").map((r) => r.id),
    };
    const found = await fetchPlaceDetails(g.googlePlaceId, { onCall: () => logGoogleCall("backfill_details") });
    if (found.status !== "ok") return { ...base, status: found.status };
    const plan = planFill(g.rows, found.place);
    return plan ? { ...base, status: "fill", matchName: found.place.name, plan } : { ...base, status: "nothing" };
  });
  const next = offset + DETAILS_BATCH;
  return { total: groups.length, offset, nextOffset: next < groups.length ? next : null, groups: checked };
}

function validDetailUpdate(u) {
  const ids = (list) => Array.isArray(list) && list.every((id) => typeof id === "string" && UUID.test(id));
  return (
    u && ids(u.thrones || []) && ids(u.nextInLine || []) &&
    typeof u.googlePlaceId === "string" && PLACE_ID.test(u.googlePlaceId) &&
    optionalText(u.address, 300) && optionalText(u.neighbourhood, 100) && optionalText(u.city, 100) && optionalText(u.cuisine, 80) &&
    (u.mapsUrl === undefined || u.mapsUrl === null || safeMapsUrl(u.mapsUrl) !== null)
  );
}

async function detailsApply(admin, updates) {
  if (!Array.isArray(updates) || updates.length === 0 || updates.length > 100 || !updates.every(validDetailUpdate)) {
    return NextResponse.json({ error: "Invalid updates" }, { status: 400 });
  }
  const cuisineId = await sharedCuisineIds(admin);
  let rows = 0, cuisinesFilled = 0;
  for (const u of updates) {
    for (const [table, wanted] of [["thrones", u.thrones || []], ["next_in_line", u.nextInLine || []]]) {
      if (wanted.length === 0) continue;
      // Only rows that really belong to this place - an id can't be used to
      // reach another place's rows.
      const { data: own, error: ownErr } = await admin.from(table).select("id").in("id", wanted).eq("google_place_id", u.googlePlaceId);
      if (ownErr) return NextResponse.json({ error: ownErr.message }, { status: 500 });
      const ids = (own || []).map((r) => r.id);
      if (ids.length === 0) continue;
      const result = await fillBlanks(admin, table, ids, u, cuisineId);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
      rows += ids.length;
      cuisinesFilled += result.cuisinesFilled;
    }
  }
  return NextResponse.json({ rows, cuisinesFilled });
}

// Fills blank address, neighbourhood, city, map link (and, on Next in Line,
// cuisine) on exactly these rows. Never changes a field that has a value.
async function fillBlanks(admin, table, ids, u, cuisineId) {
  const blanks = {
    address: u.address, neighbourhood: u.neighbourhood, city: u.city,
    maps_url: u.mapsUrl ? safeMapsUrl(u.mapsUrl) : null,
    ...(table === "next_in_line" ? { cuisine_id: cuisineId.get((u.cuisine || "").toLowerCase()) } : {}),
  };
  let cuisinesFilled = 0;
  for (const [column, value] of Object.entries(blanks)) {
    if (!value) continue;
    const { data: filled, error } = await admin.from(table).update({ [column]: value }).in("id", ids).is(column, null).select("id");
    if (error) return { error: error.message };
    if (column === "cuisine_id") cuisinesFilled += filled?.length ?? 0;
  }
  return { cuisinesFilled };
}

// Nomarchy's shared cuisines by name. A cuisine someone made themselves is
// never suggested.
async function sharedCuisineIds(admin) {
  const { data } = await admin.from("cuisines").select("id, name").eq("is_default", true);
  return new Map((data || []).map((c) => [c.name.toLowerCase(), c.id]));
}

function validUpdate(u) {
  const ids = (list) => Array.isArray(list) && list.every((id) => typeof id === "string" && UUID.test(id));
  return (
    u &&
    optionalText(u.address, 300) && optionalText(u.neighbourhood, 100) && optionalText(u.city, 100) && optionalText(u.cuisine, 80) &&
    (u.mapsUrl === undefined || u.mapsUrl === null || safeMapsUrl(u.mapsUrl) !== null) &&
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
  const cuisineId = await sharedCuisineIds(admin);

  let saved = 0;
  let cuisinesFilled = 0;
  for (const u of updates) {
    for (const [table, wanted] of [["thrones", u.thrones || []], ["next_in_line", u.nextInLine || []]]) {
      if (wanted.length === 0) continue;
      // Only rows still without a Google ID - the never-overwrite guarantee.
      const { data: open, error: openErr } = await admin.from(table).select("id").in("id", wanted).is("google_place_id", null);
      if (openErr) return NextResponse.json({ error: openErr.message }, { status: 500 });
      const ids = (open || []).map((r) => r.id);
      if (ids.length === 0) continue;

      // Fill blanks first (before the ID is set), so the restaurant's page
      // address is made from the full name, neighbourhood and city.
      const result = await fillBlanks(admin, table, ids, u, cuisineId);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });
      cuisinesFilled += result.cuisinesFilled;

      const { error } = await admin.from(table).update({ google_place_id: u.googlePlaceId, lat: u.lat, lng: u.lng }).in("id", ids).is("google_place_id", null);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      saved += ids.length;
    }
  }
  return NextResponse.json({ saved, cuisinesFilled });
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
    if (body.mode === "details-preview") {
      const offset = Number.isInteger(body.offset) && body.offset >= 0 ? body.offset : 0;
      return NextResponse.json(await detailsPreview(admin, offset));
    }
    if (body.mode === "details-apply") return await detailsApply(admin, body.updates);
    if (body.mode === "search") {
      // The owner's own search for one place, for review items where the
      // automatic search couldn't find the right one (another city, a vague
      // area, a renamed restaurant). Looks only - nothing is saved here.
      const query = typeof body.query === "string" ? body.query.trim().slice(0, 200) : "";
      const city = typeof body.city === "string" ? body.city.trim().slice(0, 100) : "";
      if (!query) return NextResponse.json({ error: "Type a name to search for" }, { status: 400 });
      const results = await searchGooglePlaces(query, city, { onCall: () => logGoogleCall("backfill_search") });
      if (results === null) return NextResponse.json({ error: "Google couldn't be reached - try again" }, { status: 502 });
      return NextResponse.json({ results });
    }
    return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Something went wrong" }, { status: 500 });
  }
}
