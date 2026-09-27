// ============================================================
// One-time (or occasional refresh) import of Toronto's real restaurants
// from the City of Toronto's open DineSafe dataset, into the local
// `restaurants` table that app/api/ai's "Look it up" now checks before
// falling back to Claude's web search.
//
// Not triggered by app code - visit this URL yourself (with the secret
// key) whenever you want to (re)populate or refresh it. Re-running is
// safe: it upserts on (source, source_id), so it never duplicates.
//
// Column names confirmed against a real run of the live dataset (2026-09):
// estId, estName, address, typeDesc, latitude, longitude. findKey() still
// checks a couple of alternate spellings first, purely so a future schema
// change fails loudly with sampleColumns rather than silently importing
// the wrong field.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const CKAN_BASE = "https://ckan0.cf.opendata.inter.prod-toronto.ca";
const PACKAGE_ID = "dinesafe";
const PAGE_SIZE = 5000;
const MAX_RECORDS = 400000;

// Establishment types DineSafe inspects that aren't really "a restaurant
// a friend would crown" - excluded by keyword rather than an exact type
// list, for the same reason as findKey() below.
const EXCLUDE_KEYWORDS = [
  "school", "hospital", "nursing", "child care", "day care", "daycare",
  "correctional", "shelter", "long term care", "retirement", "college", "university",
];

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function findKey(row, candidates) {
  const keys = Object.keys(row);
  for (const candidate of candidates) {
    const match = keys.find((k) => k.toLowerCase() === candidate.toLowerCase());
    if (match) return match;
  }
  return undefined;
}

async function fetchResourceId() {
  const res = await fetch(`${CKAN_BASE}/api/3/action/package_show?id=${PACKAGE_ID}`);
  if (!res.ok) throw new Error(`CKAN package_show failed: ${res.status}`);
  const body = await res.json();
  const resources = body.result?.resources || [];
  const active = resources.find((r) => r.datastore_active);
  if (!active) throw new Error("No datastore-active resource found for the dinesafe package");
  return active.id;
}

async function fetchAllRecords(resourceId) {
  const records = [];
  let offset = 0;
  for (;;) {
    const url = `${CKAN_BASE}/api/3/action/datastore_search?resource_id=${resourceId}&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CKAN datastore_search failed: ${res.status}`);
    const body = await res.json();
    const batch = body.result?.records || [];
    records.push(...batch);
    if (batch.length < PAGE_SIZE || offset > MAX_RECORDS) break;
    offset += PAGE_SIZE;
  }
  return records;
}

export async function GET(request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!process.env.RESTAURANT_IMPORT_SECRET || key !== process.env.RESTAURANT_IMPORT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let resourceId;
  try {
    resourceId = await fetchResourceId();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }

  let records;
  try {
    records = await fetchAllRecords(resourceId);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
  if (records.length === 0) {
    return NextResponse.json({ error: "No records returned from DineSafe" }, { status: 502 });
  }

  const sample = records[0];
  const idKey = findKey(sample, ["estId", "establishmentId", "establishment_id"]);
  const nameKey = findKey(sample, ["estName", "establishmentName", "establishment_name"]);
  const typeKey = findKey(sample, ["typeDesc", "establishmentType", "establishment_type"]);
  const addressKey = findKey(sample, ["address", "establishmentAddress", "establishment_address"]);
  const latKey = findKey(sample, ["latitude"]);
  const lngKey = findKey(sample, ["longitude"]);

  if (!idKey || !nameKey || !addressKey) {
    return NextResponse.json(
      { error: "Couldn't find expected columns in the DineSafe data", sampleColumns: Object.keys(sample) },
      { status: 500 }
    );
  }

  const byId = new Map();
  for (const r of records) {
    const type = ((typeKey ? r[typeKey] : "") || "").toLowerCase();
    if (EXCLUDE_KEYWORDS.some((kw) => type.includes(kw))) continue;
    const id = r[idKey];
    const name = r[nameKey];
    if (!id || !name) continue;
    if (byId.has(id)) continue;
    byId.set(id, {
      source: "dinesafe",
      source_id: String(id),
      name: name.trim(),
      address: (r[addressKey] || "").trim() || null,
      city: "Toronto",
      lat: latKey && r[latKey] ? Number(r[latKey]) : null,
      lng: lngKey && r[lngKey] ? Number(r[lngKey]) : null,
      updated_at: new Date().toISOString(),
    });
  }

  const rows = Array.from(byId.values());
  const supabase = admin();
  let imported = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const { error } = await supabase.from("restaurants").upsert(chunk, { onConflict: "source,source_id" });
    if (error) return NextResponse.json({ error: error.message, importedSoFar: imported }, { status: 500 });
    imported += chunk.length;
  }

  return NextResponse.json({ imported, totalRecordsSeen: records.length });
}
