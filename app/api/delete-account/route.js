// ============================================================
// Deletes the calling user's own account - but NOT their crowns and
// reviews. Those are real, useful data about real restaurants (and, on
// a shared throne's decree, potentially the only record of why a place
// earned its spot) - deleting the person shouldn't delete the review.
//
// This used to just delete the auth.users row and let cascades clean up
// everything downstream (profiles, and from there thrones, fallen,
// next_in_line, endorsements, follows). That's exactly the problem:
// profiles.id references auth.users ON DELETE CASCADE, and thrones/fallen
// reference profiles the same way, so deleting the auth user took every
// throne and decree down with it. There is no way to delete auth.users
// and keep the profiles row alive - the cascade isn't optional per-row.
//
// So instead: the profiles row survives, anonymized (display name becomes
// "No longer a user", avatar cleared, is_public forced true so their
// thrones/fallen stay visible to everyone the way they always were -
// otherwise the RLS policy that already hides a private profile's
// content from everyone but its owner would hide this content from
// literally everyone, defeating the point). Removed from both sides of
// `follows`, so they stop appearing as an active, comparable friend in
// anyone's Court the moment this runs - the actual crown counts on
// Trending/Best in the Land are untouched by that, since those aggregate
// independently of any follow relationship. Sign-in is revoked via a
// long ban (Supabase has no literal "permanent", ~100 years is the
// standard stand-in) rather than deleting auth.users, which is what
// keeps the profiles row - and everything hanging off it - alive.
//
// Their real email is also removed, not just the account disabled: it's
// overwritten on auth.users (the field Supabase actually checks for
// sign-in/magic links) with a generated placeholder, and any linked OAuth
// identity (Google) - which independently stores a copy of whatever
// email/name/photo that provider handed over - is unlinked first, while
// their own session is still valid (unlinkIdentity has to run as the
// user, not the admin client). One caveat, a Supabase Auth platform
// limit rather than a choice made here: unlinkIdentity refuses to remove
// someone's LAST remaining identity, so the primary one (almost always
// "email") can't be unlinked this way - overwriting auth.users.email
// below is what actually neutralizes it, since that's the address
// Supabase would check on any future sign-in attempt.
//
// The anon key can never do any of this - it all needs the service role
// key, which must never reach the browser. This route is the only place
// that key is used, and only after verifying (via the caller's own
// token, on the anon-key client) which user is asking - never trusting a
// user id passed in the request body.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  const { error: profileErr } = await admin
    .from("profiles")
    .update({
      display_name: "No longer a user",
      avatar_url: null,
      is_public: true,
      discoverable: false,
      is_owner: false,
    })
    .eq("id", data.user.id);
  if (profileErr) {
    return NextResponse.json({ error: "Couldn't delete your account" }, { status: 500 });
  }

  const { error: followsErr } = await admin
    .from("follows")
    .delete()
    .or(`follower_id.eq.${data.user.id},followee_id.eq.${data.user.id}`);
  if (followsErr) {
    return NextResponse.json({ error: "Couldn't delete your account" }, { status: 500 });
  }

  // Private data with no reason to survive the account - unlike thrones/
  // fallen, nothing else on the app reads or displays these once the
  // owner's gone.
  await admin.from("next_in_line").delete().eq("user_id", data.user.id);
  await admin.from("ai_calls").delete().eq("user_id", data.user.id);

  const { error: authErr } = await admin.auth.admin.updateUserById(data.user.id, {
    email: `deleted-${data.user.id}@deleted.invalid`,
    email_confirm: true,
    user_metadata: {},
    ban_duration: PERMANENT_BAN,
  });
  if (authErr) {
    return NextResponse.json({ error: "Couldn't delete your account" }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
