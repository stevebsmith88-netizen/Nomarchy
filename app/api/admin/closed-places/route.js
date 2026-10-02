// ============================================================
// Owner-only: confirm that a place is permanently closed ("mark"), or undo
// it ("reopen"). Marking is the owner's own decision after the closure
// check - nothing marks a place automatically.
//
//   mark:   records the place in closed_places and clears the saved map
//           coordinates on every crown and list entry for it (Google's
//           terms only allow keeping coordinates for a place that is
//           still being refreshed). Names, decrees, photos and notes are
//           never touched.
//   reopen: removes the mark and flags the saved entries so the daily
//           coordinate refresh restores their map pins.
//
// The place name comes from our own saved entries, never from the browser.
// ============================================================

import { NextResponse } from "next/server";
import { requireOwner } from "../../../../lib/requireOwner";

const PLACE_ID = /^[A-Za-z0-9_-]{10,200}$/;

export async function POST(request) {
  const { admin, error } = await requireOwner(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const { action, placeId } = body;
  if (!["mark", "reopen"].includes(action) || typeof placeId !== "string" || !PLACE_ID.test(placeId)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (action === "mark") {
    const [thrones, nextInLine] = await Promise.all([
      admin.from("thrones").select("place_name").eq("google_place_id", placeId).limit(1),
      admin.from("next_in_line").select("place_name").eq("google_place_id", placeId).limit(1),
    ]);
    if (thrones.error || nextInLine.error) return NextResponse.json({ error: "Couldn't look that place up" }, { status: 500 });
    const name = thrones.data[0]?.place_name || nextInLine.data[0]?.place_name;
    if (!name) return NextResponse.json({ error: "No saved place has that ID" }, { status: 404 });

    const { error: markErr } = await admin.from("closed_places").upsert(
      { google_place_id: placeId, place_name: name, closed_at: new Date().toISOString() },
      { onConflict: "google_place_id" }
    );
    if (markErr) return NextResponse.json({ error: markErr.message }, { status: 500 });
    for (const table of ["thrones", "next_in_line"]) {
      const { error: clearErr } = await admin.from(table).update({ lat: null, lng: null }).eq("google_place_id", placeId);
      if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 500 });
    }
    return NextResponse.json({ marked: true, name });
  }

  const { error: delErr } = await admin.from("closed_places").delete().eq("google_place_id", placeId);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
  for (const table of ["thrones", "next_in_line"]) {
    const { error: flagErr } = await admin.from(table).update({ coords_refreshed_at: null }).eq("google_place_id", placeId);
    if (flagErr) return NextResponse.json({ error: flagErr.message }, { status: 500 });
  }
  return NextResponse.json({ reopened: true });
}
