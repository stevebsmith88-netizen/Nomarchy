// ============================================================
// Owner-only: removes a decree that was reported. The decree becomes a
// standard notice, the throne's photos are cleared (and deleted from
// storage), and the person's crown, cuisine and everything else stay. The
// original decree and photo list are saved in content_removals first, so a
// mistaken removal can be reversed, and the author sees a notification.
//
// Same verify-then-service-role pattern as the other admin routes.
// ============================================================

import { NextResponse } from "next/server";
import { requireOwner } from "../../../../lib/requireOwner";
import { REMOVED_DECREE_NOTICE, reviewPhotoPath } from "../../../../lib/decreeReports";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request) {
  const { admin, error } = await requireOwner(request);
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  if (typeof body.throneId !== "string" || !UUID.test(body.throneId)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: throne, error: findErr } = await admin
    .from("thrones").select("id, user_id, place_name, decree, photos").eq("id", body.throneId).single();
  if (findErr || !throne) return NextResponse.json({ error: "That decree no longer exists" }, { status: 404 });
  if (throne.decree === REMOVED_DECREE_NOTICE && !(throne.photos || []).length) {
    return NextResponse.json({ removed: true, already: true });
  }

  // Which files to delete, worked out before the photo list is cleared.
  const paths = (throne.photos || []).map((u) => reviewPhotoPath(u, throne.user_id)).filter(Boolean);

  // Keep the original first - if this fails, nothing is changed.
  const { error: logErr } = await admin.from("content_removals").insert({
    throne_id: throne.id, user_id: throne.user_id, place_name: throne.place_name,
    original_decree: throne.decree, original_photos: throne.photos || [],
  });
  if (logErr) return NextResponse.json({ error: "Couldn't record the removal, so nothing was changed" }, { status: 500 });

  const { error: updErr } = await admin.from("thrones").update({ decree: REMOVED_DECREE_NOTICE, photos: [] }).eq("id", throne.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Best effort: the photos no longer show anywhere; this also deletes the files.
  if (paths.length) await admin.storage.from("review-photos").remove(paths).catch(() => {});

  return NextResponse.json({ removed: true });
}
