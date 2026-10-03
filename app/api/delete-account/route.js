// ============================================================
// Deletes the calling user's own account. The person chooses how far:
//
//   eraseContent: true  - everything goes: the account, name, avatar,
//     Next in Line, crowns, past crowns, decrees, review photos,
//     endorsements, follows, feedback - all of it. Photo and avatar files
//     are removed from storage first (Supabase won't delete a user who
//     still owns files), then the sign-in itself is deleted, which cascades
//     through the profile to everything hanging off it.
//
//   eraseContent: false (or not sent) - the account is closed and the
//     person's name is removed, but their crowns and reviews stay up for
//     others. Those rows survive because thrones/fallen hang off the
//     profile row, so the profile is kept but anonymized: a random
//     placeholder username replaces the one built from their email, the
//     display name becomes "No longer a user", the avatar and its file are
//     removed, their personal settings are reset (accessibility,
//     notifications, hidden cuisines; reminder emails off), and every
//     purely personal record (follows, blocks, invites, Next in Line,
//     feedback, signup source, conquests, rank history, endorsements they
//     gave, notification dismissals) is deleted. The crowns that stay
//     are still stored under an internal id - pseudonymous, not shown with
//     any name. The privacy policy says exactly this.
//
// Either way their email is gone (deleted outright, or overwritten with a
// placeholder), any linked Google identity is unlinked first (while their
// own session is still valid - unlinkIdentity has to run as the user), and
// sign-in is blocked.
//
// The anon key can never do any of this - it all needs the service role
// key, which must never reach the browser. This route is the only place
// that key is used for it, and only after verifying (via the caller's own
// token) which user is asking - never trusting a user id from the body.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";

// Supabase's ban_duration has no "forever" value - a duration this long
// is the documented way to get a permanent-in-practice ban.
const PERMANENT_BAN = "876000h";

export async function POST(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data } = await supabase.auth.getUser(token);
  if (!data.user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Best-effort, and has to happen now: dropping a linked identity needs
  // the caller's own session, which won't exist anymore once they're
  // banned below. Ignore failures here rather than blocking the deletion
  // on them - the email overwrite further down is what actually matters.
  const { data: identityData } = await supabase.auth.getUserIdentities();
  const identities = identityData?.identities || [];
  if (identities.length > 1) {
    for (const identity of identities) {
      if (identity.provider === "email") continue;
      await supabase.auth.unlinkIdentity(identity).catch(() => {});
    }
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  const userId = data.user.id;

  const body = await request.json().catch(() => ({}));
  const eraseContent = body?.eraseContent === true;

  // Their uploaded files first, in both modes for the avatar and in full
  // mode for review photos too.
  await removeFolder(admin, "avatars", userId);
  if (eraseContent) await removeFolder(admin, "review-photos", userId);

  // Feedback they sent can contain personal text; remove it either way.
  await admin.from("feedback").delete().eq("user_id", userId);

  if (eraseContent) {
    // Deleting the sign-in cascades through profiles to thrones, fallen,
    // next_in_line, endorsements, follows, blocks, invites, conquests, rank
    // history, dismissed notifications, signup source and AI call log.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      return NextResponse.json({ error: "Couldn't delete your account" }, { status: 500 });
    }
    return NextResponse.json({ deleted: true, erased: true });
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({
      username: `former-member-${randomBytes(5).toString("hex")}`,
      display_name: "No longer a user",
      city: null,
      avatar_url: null,
      is_public: true,
      discoverable: false,
      is_owner: false,
      // Personal settings go too, and the placeholder email must never be
      // sent a reminder (it would bounce).
      reminders_opt_out: true,
      a11y_prefs: {},
      hidden_cuisine_ids: [],
    })
    .eq("id", userId);
  if (profileErr) {
    return NextResponse.json({ error: "Couldn't delete your account" }, { status: 500 });
  }

  const { error: followsErr } = await admin
    .from("follows")
    .delete()
    .or(`follower_id.eq.${userId},followee_id.eq.${userId}`);
  if (followsErr) {
    return NextResponse.json({ error: "Couldn't delete your account" }, { status: 500 });
  }

  // Personal records with no reason to survive the account. Nothing else in
  // the app reads or shows these once the owner is gone.
  await Promise.all([
    admin.from("blocks").delete().or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
    admin.from("invites").delete().or(`invitee_id.eq.${userId},inviter_id.eq.${userId}`),
    admin.from("next_in_line").delete().eq("user_id", userId),
    admin.from("ai_calls").delete().eq("user_id", userId),
    admin.from("signup_sources").delete().eq("user_id", userId),
    admin.from("conquests").delete().eq("user_id", userId),
    admin.from("rank_promotions").delete().eq("user_id", userId),
    admin.from("dismissed_notifications").delete().eq("user_id", userId),
    admin.from("endorsements").delete().eq("endorser_id", userId),
    admin.from("google_api_calls").update({ user_id: null }).eq("user_id", userId),
  ]);

  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    email: `deleted-${userId}@deleted.invalid`,
    email_confirm: true,
    user_metadata: {},
    ban_duration: PERMANENT_BAN,
  });
  if (authErr) {
    return NextResponse.json({ error: "Couldn't delete your account" }, { status: 500 });
  }

  return NextResponse.json({ deleted: true, erased: false });
}

// Removes every file in a user's folder ("{user_id}/...") in a storage
// bucket. Best effort per page; a failure stops that bucket's cleanup but
// never blocks the deletion itself.
async function removeFolder(admin, bucket, userId) {
  for (let page = 0; page < 20; page++) {
    const { data: files, error } = await admin.storage.from(bucket).list(userId, { limit: 100 });
    if (error || !files || files.length === 0) return;
    const paths = files.filter((f) => f.name).map((f) => `${userId}/${f.name}`);
    const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
    if (rmErr || files.length < 100) return;
  }
}
