// ============================================================
// Owner-only, run by hand from the Admin tab: asks Google which of the
// places people have saved are now permanently closed. Read-only - it
// writes nothing to the database and changes nothing in anyone's kingdom;
// the result is just shown to the owner. Done in batches (the caller keeps
// asking with the next offset) so each request stays well inside the time
// limit however many places there are.
// ============================================================

import { NextResponse } from "next/server";
import { checkClosures } from "../../../../lib/closureCheck";
import { logGoogleCall } from "../../../../lib/googleUsage";
import { requireOwner } from "../../../../lib/requireOwner";

export const maxDuration = 60;

export async function POST(request) {
  const { admin, error } = await requireOwner(request);
  if (error) return error;

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_PLACES_API_KEY isn't set on the server" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const offset = Number.isInteger(body.offset) && body.offset >= 0 ? body.offset : 0;

  try {
    const result = await checkClosures(admin, offset, { apiKey, onCall: () => logGoogleCall("closure_check") });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Closure check failed", err?.message);
    return NextResponse.json({ error: "The check failed - try again" }, { status: 500 });
  }
}
