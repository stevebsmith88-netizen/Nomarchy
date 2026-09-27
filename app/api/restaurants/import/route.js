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
// Pulls the dataset's own CSV export rather than paging through the CKAN
// datastore JSON API - the same data as JSON (with field names repeated
// on every row, plus response/parse overhead held across ~80 paginated
// fetches) ran to ~470MB and crashed the function; as CSV it's ~44MB.
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

function findKey(headers, candidates) {
  for (const candidate of candidates) {
    const match = headers.find((h) => h.toLowerCase() === candidate.toLowerCase());
    if (match) return match;
  }
  return undefined;
}

async function fetchCsvUrl() {
  const res = await fetch(`${CKAN_BASE}/api/3/action/package_show?id=${PACKAGE_ID}`);
  if (!res.ok) throw new Error(`CKAN package_show failed: ${res.status}`);
  const body = await res.json();
  const resources = body.result?.resources || [];
  const csv = resources.find((r) => (r.format || "").toUpperCase() === "CSV");
  if (!csv?.url) throw new Error("No CSV resource found for the dinesafe package");
  return csv.url;
}

// Minimal RFC4180 parser - handles quoted fields, embedded commas/newlines,
// and doubled-quote escaping ("" inside a quoted field means a literal ").
// Returns an array of rows, each row an array of raw string cells.
// Slices whole runs of characters out at once (text.slice) rather than
// building fields one character at a time - a char-by-char += loop looks
// equivalent but is drastically more memory-hungry over tens of millions
// of characters, since each append can force a fresh allocation.
function parseCsv(text) {
  const rows = [];
  const len = text.length;
  let i = 0;
  let row = [];
  while (i < len) {
    let field;
    if (text[i] === '"') {
      let j = i + 1;
      let hasEscaped = false;
      while (j < len) {
        if (text[j] === '"') {
          if (text[j + 1] === '"') { hasEscaped = true; j += 2; continue; }
          break;
        }
        j++;
      }
      const raw = text.slice(i + 1, j);
      field = hasEscaped ? raw.replace(/""/g, '"') : raw;
      i = j + 1;
    } else {
      let j = i;
      while (j < len && text[j] !== "," && text[j] !== "\n" && text[j] !== "\r") j++;
      field = text.slice(i, j);
      i = j;
    }
    row.push(field);
    if (text[i] === ",") {
      i++;
      continue;
    }
    if (text[i] === "\r") i++;
    if (text[i] === "\n") i++;
    rows.push(row);
    row = [];
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

export async function GET(request) {
  const key = new URL(request.url).searchParams.get("key");
  if (!process.env.RESTAURANT_IMPORT_SECRET || key !== process.env.RESTAURANT_IMPORT_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY environment variable" }, { status: 500 });
  }

  let csvUrl;
  try {
    csvUrl = await fetchCsvUrl();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }

  let text;
  try {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`Failed to download CSV: ${res.status}`);
    text = await res.text();
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }

  let rows;
  try {
    const allRows = parseCsv(text);
    const headerRow = allRows[0];
    const dataRows = allRows.slice(1).filter((r) => r.length > 1 || r[0] !== "");
    if (!headerRow || dataRows.length === 0) {
      return NextResponse.json({ error: "No rows found in the DineSafe CSV" }, { status: 502 });
    }

    const idIdx = headerRow.indexOf(findKey(headerRow, ["estId", "establishmentId", "establishment_id"]));
    const nameIdx = headerRow.indexOf(findKey(headerRow, ["estName", "establishmentName", "establishment_name"]));
    const typeIdx = headerRow.indexOf(findKey(headerRow, ["typeDesc", "establishmentType", "establishment_type"]));
    const addressIdx = headerRow.indexOf(findKey(headerRow, ["address", "establishmentAddress", "establishment_address"]));
    const latIdx = headerRow.indexOf(findKey(headerRow, ["latitude"]));
    const lngIdx = headerRow.indexOf(findKey(headerRow, ["longitude"]));

    if (idIdx === -1 || nameIdx === -1 || addressIdx === -1) {
      return NextResponse.json(
        { error: "Couldn't find expected columns in the DineSafe CSV", sampleColumns: headerRow },
        { status: 500 }
      );
    }

    const byId = new Map();
    for (const cells of dataRows) {
      const type = (typeIdx !== -1 ? cells[typeIdx] || "" : "").toLowerCase();
      if (EXCLUDE_KEYWORDS.some((kw) => type.includes(kw))) continue;
      const id = cells[idIdx];
      const name = cells[nameIdx];
      if (!id || !name) continue;
      if (byId.has(id)) continue;
      byId.set(id, {
        source: "dinesafe",
        source_id: String(id),
        name: name.trim(),
        address: (cells[addressIdx] || "").trim() || null,
        city: "Toronto",
        lat: latIdx !== -1 && cells[latIdx] ? Number(cells[latIdx]) : null,
        lng: lngIdx !== -1 && cells[lngIdx] ? Number(cells[lngIdx]) : null,
        updated_at: new Date().toISOString(),
      });
    }
    rows = Array.from(byId.values());
  } catch (e) {
    return NextResponse.json({ error: `Parsing failed: ${e.message}` }, { status: 500 });
  }
  const supabase = admin();
  let imported = 0;
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const { error } = await supabase.from("restaurants").upsert(chunk, { onConflict: "source,source_id" });
    if (error) return NextResponse.json({ error: error.message, importedSoFar: imported }, { status: 500 });
    imported += chunk.length;
  }

  return NextResponse.json({ imported, totalRowsSeen: dataRows.length });
}
