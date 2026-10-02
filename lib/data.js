// ============================================================
// NOMARCHY data layer
// This file replaces every window.storage.get / window.storage.set call
// from the prototype. Same shapes going in and out, so the UI barely changes.
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { CHANGELOG } from "./changelog";
import { getStoredRef } from "./signupSource";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ---------- CONTENT ----------

// Soften, don't reject - "best fucking ramen ever" should still say
// that, just with the word masked, not get bounced or silently rewritten
// into something bland. Applied wherever someone writes their own free
// text (a decree or a next-in-line note) before it's saved, so it's
// consistent everywhere that text is later displayed rather than needing
// every render spot to remember to mask it. A short, common list on
// purpose - this is a tone nudge for a small trusted group, not an
// adversarial filter, so it doesn't need to be exhaustive or unbeatable.
const PROFANITY_RE = new RegExp(
  `\\b(${["fuck", "shit", "bitch", "asshole", "bastard", "cunt", "dick", "piss", "cock", "twat", "wanker", "prick"]
    .map((w) => `${w}\\w*`)
    .join("|")})\\b`,
  "gi"
);

export function maskProfanity(text) {
  if (!text) return text;
  return text.replace(PROFANITY_RE, (m) => (m.length <= 2 ? m : m[0] + "*".repeat(m.length - 2) + m[m.length - 1]));
}

// ---------- AUTH ----------

// Magic link. No passwords to manage, no reset flow to build.
export async function signIn(email) {
  // The saved source tag rides along on the sign-up request itself, so it
  // still reaches a brand-new account if the emailed link ends up opened in
  // a different browser. Ignored for people who already have an account.
  const signupRef = getStoredRef();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin,
      ...(signupRef ? { data: { signup_ref: signupRef } } : {}),
    },
  });
  if (error) throw error;
  return { sent: true };
}

// The link in that same email opens in Safari, not back inside a
// home-screen PWA - iOS has no way to route a Mail link into an installed
// web app's own window. Typing this code in instead never leaves the app,
// so it sidesteps the problem rather than working around it.
export async function verifyCode(email, token) {
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw error;
  return data;
}

// Redirects away to Google and back - there's no response to await here,
// only an error if the redirect itself couldn't be started (e.g. the
// provider isn't enabled yet in the Supabase dashboard).
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

// ---------- LINKED SIGN-IN METHODS ----------

// For someone who originally signed up by email code and wants to add
// Google as a second way in, without it becoming a separate account -
// unlike signInWithGoogle, this attaches the Google identity to whoever
// is CURRENTLY signed in, rather than starting a fresh sign-in.
export async function linkGoogle() {
  const { error } = await supabase.auth.linkIdentity({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function getLinkedProviders() {
  const { data, error } = await supabase.auth.getUserIdentities();
  if (error) throw error;
  return (data?.identities || []).map((i) => i.provider);
}

// Supabase refuses to unlink someone's only identity, so this can never
// leave an account with no way to sign back in.
export async function unlinkGoogle() {
  const { data, error: idErr } = await supabase.auth.getUserIdentities();
  if (idErr) throw idErr;
  const identity = data?.identities?.find((i) => i.provider === "google");
  if (!identity) return;
  const { error } = await supabase.auth.unlinkIdentity(identity);
  if (error) throw error;
}

// Removes your access and your identity, not your crowns and reviews -
// see /api/delete-account for why (auth.users can't be deleted without
// cascading away the profile, and with it every throne and decree).
export async function deleteAccount() {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/delete-account", {
    method: "POST",
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Couldn't delete your account");
  return data;
}

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

// Fires whenever someone logs in or out. Wire this to your top-level state.
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}

const PROFILE_FIELDS = "id, username, display_name, city, is_owner, is_public, avatar_url, onboarded, discoverable, reminders_opt_out, notifications_seen_at, notify_follows, notify_crowns, notify_reviews, notify_endorsements, hidden_cuisine_ids, last_rank_min";

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_FIELDS)
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProfile(userId, fields) {
  const { data, error } = await supabase
    .from("profiles")
    .update(fields)
    .eq("id", userId)
    .select(PROFILE_FIELDS)
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("That username is already taken.");
    throw error;
  }
  return data;
}

// Always the same path per user (unlike review photos, which each get a
// unique filename) - upsert: true so re-uploading replaces the old one
// instead of accumulating orphaned files.
export async function uploadAvatar(userId, file) {
  if (file.size > MAX_PHOTO_BYTES) throw new Error("That photo's too large (5MB max).");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/avatar.${ext}`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
  if (error) throw error;
  const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  // Cache-bust: the path never changes on a re-upload, so without this a
  // browser that already cached the old image would keep showing it.
  return `${url}?v=${Date.now()}`;
}

// ---------- CUISINES ----------

export async function loadCuisines(userId) {
  const { data, error } = await supabase
    .from("cuisines")
    .select("id, name, is_default")
    .or(`is_default.eq.true,created_by.eq.${userId}`)
    .order("is_default", { ascending: false })
    .order("name");
  if (error) throw error;
  return data;
}

export async function addCuisine(userId, name) {
  const { data, error } = await supabase
    .from("cuisines")
    .insert({ name: name.trim(), created_by: userId, is_default: false })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ---------- REVIEW PHOTOS ----------

export const MAX_REVIEW_PHOTOS = 3;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export async function uploadReviewPhoto(userId, file) {
  if (file.size > MAX_PHOTO_BYTES) throw new Error("That photo's too large (5MB max).");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage
    .from("review-photos")
    .upload(path, file, { contentType: file.type || "image/jpeg" });
  if (error) throw error;
  return supabase.storage.from("review-photos").getPublicUrl(path).data.publicUrl;
}

// Best-effort - deleting an image doesn't need to block removing it from a
// review, it just leaves an orphaned file in storage on failure rather
// than losing the edit.
export async function deleteReviewPhoto(url) {
  try {
    const path = decodeURIComponent(new URL(url).pathname.split("/review-photos/")[1] || "");
    if (path) await supabase.storage.from("review-photos").remove([path]);
  } catch {
    // ignore
  }
}

// ---------- THE KINGDOM ----------

// Returns the same { [cuisineName]: { current, fallen: [] } } shape
// the prototype already renders, so the UI code carries over unchanged.
export async function loadKingdom(userId) {
  const [thronesRes, fallenRes] = await Promise.all([
    supabase.from("thrones")
      .select("*, cuisines(id, name)")
      .eq("user_id", userId),
    supabase.from("fallen")
      .select("*, cuisines(id, name)")
      .eq("user_id", userId)
      .order("dethroned_at", { ascending: false }),
  ]);
  if (thronesRes.error) throw thronesRes.error;
  if (fallenRes.error) throw fallenRes.error;

  const slots = {};
  for (const t of thronesRes.data) {
    const name = t.cuisines.name;
    slots[name] = slots[name] || { current: null, fallen: [] };
    slots[name].current = {
      id: t.id,
      cuisineId: t.cuisine_id,
      name: t.place_name,
      area: t.neighbourhood,
      address: t.address,
      rating: t.rating,
      mapsUrl: t.maps_url,
      lat: t.lat,
      lng: t.lng,
      decree: t.decree,
      photos: t.photos || [],
      crownedAt: new Date(t.crowned_at).getTime(),
    };
  }
  for (const f of fallenRes.data) {
    const name = f.cuisines.name;
    slots[name] = slots[name] || { current: null, fallen: [] };
    slots[name].fallen.push({
      name: f.place_name,
      area: f.neighbourhood,
      decree: f.decree,
      crownedAt: f.crowned_at ? new Date(f.crowned_at).getTime() : null,
      dethronedAt: new Date(f.dethroned_at).getTime(),
    });
  }
  return slots;
}

// Claude's web search (see app/api/ai) returns an address, never
// coordinates - this fills that gap so a crowned pick still gets a real
// pin on the Kingdom map, via the same free Nominatim service the
// "near me" feature already uses. Best-effort: a failed or slow geocode
// should never block someone from actually crowning their pick, so this
// swallows its own errors and just leaves lat/lng null on failure.
// Passing city alongside the address is what actually makes this scale
// to other countries later - "1391 Queen St W, Toronto" can't collide
// with a same-named street anywhere else, where a bare street address
// sometimes can. The /api/geocode country restriction is just a backstop
// for the rarer case there's no city to work with at all.
async function geocodeAddress(address, city) {
  if (!address) return { lat: null, lng: null };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch("/api/geocode", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ mode: "forward", address, city }),
    });
    if (!res.ok) return { lat: null, lng: null };
    const data = await res.json();
    return { lat: data.lat ?? null, lng: data.lng ?? null };
  } catch {
    return { lat: null, lng: null };
  }
}

// Crowning and staging a coup are the SAME operation.
// upsert on (user_id, cuisine_id) means: insert if the throne is empty,
// update if it's occupied. The database trigger archives the old monarch
// into `fallen` automatically, so there's no separate coup code path.
export async function crownSpot(userId, cuisineId, place) {
  const coords = (place.lat && place.lng) ? { lat: place.lat, lng: place.lng } : await geocodeAddress(place.address, place.city);
  const { data, error } = await supabase
    .from("thrones")
    .upsert(
      {
        user_id: userId,
        cuisine_id: cuisineId,
        google_place_id: place.googlePlaceId || null,
        place_name: place.name,
        address: place.address || null,
        neighbourhood: place.area || null,
        city: place.city || null,
        rating: place.rating ? Number(place.rating) : null,
        maps_url: place.mapsUrl || null,
        lat: coords.lat,
        lng: coords.lng,
        decree: maskProfanity(place.decree),
        // Always explicit, never left out of the upsert - a coup replaces
        // the occupant in place, and the deposed restaurant's photos would
        // otherwise silently carry over onto the new one.
        photos: place.photos || [],
        crowned_at: new Date().toISOString(),
      },
      { onConflict: "user_id,cuisine_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function abdicate(throneId) {
  const { error } = await supabase.from("thrones").delete().eq("id", throneId);
  if (error) throw error;
}

// Fixing which cuisine a throne belongs to (a mis-crown) is not a coup - the
// restaurant itself doesn't change, so the archive trigger (which only
// fires when place_name changes) leaves history alone. Blocked if the
// target cuisine already has a ruler - overwriting it here would be a
// silent, undocumented coup.
export async function moveThroneCuisine(throneId, newCuisineId) {
  const { data, error } = await supabase
    .from("thrones")
    .update({ cuisine_id: newCuisineId })
    .eq("id", throneId)
    .select()
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("That cuisine already has a ruler - dethrone it first.");
    throw error;
  }
  return data;
}

// Fixing a typo or a misworded decree is not a coup either - same place,
// same crowned_at, the archive trigger only fires on a change of
// place_name, so this never touches fallen history.
export async function updateThroneDecree(throneId, decree) {
  const { data, error } = await supabase
    .from("thrones")
    .update({ decree: maskProfanity(decree) })
    .eq("id", throneId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// A wrong address/neighbourhood can get baked in at crown time (a bad
// match from the local dataset or lookup) with previously no way to
// correct it afterwards short of un-crowning and re-crowning from scratch.
// Fixing a wrong address used to leave the pin exactly where it was -
// this only ever updated the address/neighbourhood text, never the
// lat/lng the map actually uses, so a corrected address could still show
// the old, wrong pin. Re-geocodes whenever there's an address to work
// with, and only overwrites lat/lng if that succeeds - a transient
// Nominatim failure should never blank out a pin that was already right.
export async function updateThroneLocation(throneId, { address, neighbourhood }) {
  const fields = { address: address || null, neighbourhood: neighbourhood || null };
  const coords = await geocodeAddress(address);
  if (coords.lat != null && coords.lng != null) {
    fields.lat = coords.lat;
    fields.lng = coords.lng;
  }
  const { data, error } = await supabase
    .from("thrones")
    .update(fields)
    .eq("id", throneId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateThronePhotos(throneId, photos) {
  const { error } = await supabase.from("thrones").update({ photos }).eq("id", throneId);
  if (error) throw error;
}

// Un-crowning: not a coup (no replacement, no decree) and not a delete -
// the pick goes back to Next in Line instead of vanishing, in case it was
// crowned by mistake or too soon.
export async function unCrown(userId, throneId, place) {
  await abdicate(throneId);
  return addToNextInLine(userId, place);
}

// ---------- NEXT IN LINE ----------

export async function loadNextInLine(userId) {
  const { data, error } = await supabase
    .from("next_in_line")
    .select("*, cuisines(id, name)")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    name: r.place_name,
    area: r.neighbourhood,
    address: r.address,
    rating: r.rating,
    mapsUrl: r.maps_url,
    city: r.city,
    cuisine: r.cuisines?.name || null,
    cuisineId: r.cuisine_id,
    note: r.note,
    verdict: r.verdict || null,
    photos: r.photos || [],
    addedAt: new Date(r.added_at).getTime(),
    visitedAt: r.visited_at ? new Date(r.visited_at).getTime() : null,
    lat: r.lat,
    lng: r.lng,
  }));
}

// Toggle "I've been but I'm not crowning it" - a reference point distinct
// from both the shortlist (haven't been yet) and a throne (this is my
// favourite). Staying in next_in_line either way, just flagged.
export async function markVisited(id, visited) {
  const { error } = await supabase
    .from("next_in_line")
    .update({ visited_at: visited ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

// Unlike thrones, next_in_line has no one-per-cuisine constraint, so this
// is a plain update - no "blocked, dethrone first" case to handle.
export async function updatePretenderCuisine(id, cuisineId) {
  const { error } = await supabase
    .from("next_in_line")
    .update({ cuisine_id: cuisineId })
    .eq("id", id);
  if (error) throw error;
}

// Once visited, this note is what followers see as the review - editable
// any time, not just fixed at add-time.
export async function updatePretenderNote(id, note) {
  const { error } = await supabase
    .from("next_in_line")
    .update({ note: note ? maskProfanity(note) : null })
    .eq("id", id);
  if (error) throw error;
}

// Deliberately just two options, and deliberately not a star rating - the
// point is "would you send a friend here", not a public scorecard.
export async function updatePretenderVerdict(id, verdict) {
  const { error } = await supabase
    .from("next_in_line")
    .update({ verdict: verdict || null })
    .eq("id", id);
  if (error) throw error;
}

export async function updatePretenderPhotos(id, photos) {
  const { error } = await supabase.from("next_in_line").update({ photos }).eq("id", id);
  if (error) throw error;
}

export async function addToNextInLine(userId, place) {
  // Un-crowning passes the throne's own already-known coords through
  // (see handleUnCrown) so this only geocodes fresh - never re-looks-up
  // an address that's already been resolved once.
  const coords = (place.lat && place.lng) ? { lat: place.lat, lng: place.lng } : await geocodeAddress(place.address, place.city);
  const { data, error } = await supabase
    .from("next_in_line")
    .insert({
      user_id: userId,
      cuisine_id: place.cuisineId || null,
      google_place_id: place.googlePlaceId || null,
      place_name: place.name,
      address: place.address || null,
      neighbourhood: place.area || null,
      city: place.city || null,
      rating: place.rating ? Number(place.rating) : null,
      maps_url: place.mapsUrl || null,
      note: place.note ? maskProfanity(place.note) : null,
      photos: place.photos || [],
      lat: coords.lat,
      lng: coords.lng,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Bulk import. One insert call, not one per row, so a 40 item paste
// is a single round trip. Dedupe on the client before calling this.
// A pasted list only ever gives us a name (and maybe a loose area string) -
// no address, so without this every imported row would need the separate
// backfill route just to get a map pin. Matching against the local
// Toronto table (same data "Look it up" already searches) at import time
// means most entries get a real address and coordinates immediately - a
// row with no match in there just stays exactly as before.
export async function importToNextInLine(userId, rows) {
  const matches = await Promise.all(
    rows.map((r) => supabase.rpc("match_restaurant", { search_name: r.name }).then(({ data }) => data?.[0] || null))
  );
  const { data, error } = await supabase
    .from("next_in_line")
    .insert(
      rows.map((r, i) => {
        const m = matches[i];
        return {
          user_id: userId,
          cuisine_id: r.cuisineId || null,
          place_name: r.name,
          neighbourhood: r.area || m?.neighbourhood || null,
          address: m?.address || null,
          city: m?.city || null,
          lat: m?.lat || null,
          lng: m?.lng || null,
          note: r.note ? maskProfanity(r.note) : null,
        };
      })
    )
    .select();
  if (error) throw error;
  return data;
}

export async function removeFromNextInLine(id) {
  const { error } = await supabase.from("next_in_line").delete().eq("id", id);
  if (error) throw error;
}

// Promote: crown it, then drop it from the shortlist.
// Not wrapped in a transaction on purpose. If the delete fails the
// worst case is a duplicate on the list, which is a nuisance, not data loss.
export async function promoteToThrone(userId, cuisineId, place, nextInLineId) {
  const throne = await crownSpot(userId, cuisineId, place);
  if (nextInLineId) await removeFromNextInLine(nextInLineId);
  return throne;
}

// ---------- THE COURT ----------

export async function loadCourt(userId) {
  const { data: follows, error: fErr } = await supabase
    .from("follows")
    .select("followee_id, profiles!follows_followee_id_fkey(id, username, display_name, is_owner, avatar_url)")
    .eq("follower_id", userId);
  if (fErr) throw fErr;
  if (!follows.length) return [];

  const ids = follows.map((f) => f.followee_id);
  const [thronesRes, standingsRes, myEndorsements, visitedRes] = await Promise.all([
    supabase.from("thrones").select("*, cuisines(name)").in("user_id", ids),
    supabase.from("standings").select("*").in("id", ids),
    supabase.from("endorsements").select("throne_id").eq("endorser_id", userId),
    // Visited-but-not-crowned reviews - RLS already limits this to rows
    // with visited_at set, so no extra filtering needed here.
    supabase.from("next_in_line").select("*, cuisines(name)").in("user_id", ids),
  ]);
  if (thronesRes.error) throw thronesRes.error;
  if (visitedRes.error) throw visitedRes.error;

  const endorsedSet = new Set((myEndorsements.data || []).map((e) => e.throne_id));

  // Per-throne endorsement totals (anyone's, not just yours) for the
  // "Known for ..." line on a friend's profile. A failed lookup just means
  // no counts shown, never a broken Court.
  const followerCounts = {};
  const { data: followRows } = await supabase.from("follows").select("followee_id").in("followee_id", ids);
  for (const r of followRows || []) followerCounts[r.followee_id] = (followerCounts[r.followee_id] || 0) + 1;

  const endorseCounts = {};
  const throneIds = thronesRes.data.map((t) => t.id);
  if (throneIds.length) {
    const { data: endorseRows } = await supabase.from("endorsements").select("throne_id").in("throne_id", throneIds);
    for (const e of endorseRows || []) endorseCounts[e.throne_id] = (endorseCounts[e.throne_id] || 0) + 1;
  }
  const standings = Object.fromEntries((standingsRes.data || []).map((s) => [s.id, s]));

  return follows
    .map((f) => {
      const p = f.profiles;
      return {
        id: p.id,
        name: p.display_name || p.username,
        username: p.username,
        isOwner: p.is_owner,
        avatarUrl: p.avatar_url || null,
        score: standings[p.id]?.score ?? 0,
        followerCount: followerCounts[p.id] || 0,
        picks: thronesRes.data
          .filter((t) => t.user_id === p.id)
          .map((t) => ({
            id: t.id,
            cuisine: t.cuisines.name,
            cuisineId: t.cuisine_id,
            name: t.place_name,
            area: t.neighbourhood,
            address: t.address,
            city: t.city,
            decree: t.decree,
            photos: t.photos || [],
            endorsedByMe: endorsedSet.has(t.id),
            endorsements: endorseCounts[t.id] || 0,
            lat: t.lat,
            lng: t.lng,
          })),
        reviews: (visitedRes.data || [])
          .filter((n) => n.user_id === p.id)
          .map((n) => ({
            id: n.id,
            cuisine: n.cuisines?.name || null,
            name: n.place_name,
            area: n.neighbourhood,
            address: n.address,
            city: n.city,
            note: n.note,
            verdict: n.verdict || null,
            photos: n.photos || [],
          })),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export async function toggleEndorsement(userId, throneId, currentlyEndorsed) {
  if (currentlyEndorsed) {
    const { error } = await supabase
      .from("endorsements")
      .delete()
      .eq("endorser_id", userId)
      .eq("throne_id", throneId);
    if (error) throw error;
    return false;
  }
  const { error } = await supabase
    .from("endorsements")
    .insert({ endorser_id: userId, throne_id: throneId });
  // 23505 is a duplicate key: they already endorsed it, so treat as success
  if (error && error.code !== "23505") throw error;
  return true;
}

export async function followUser(userId, targetId) {
  if (targetId === userId) throw new Error("You can't follow yourself");
  const { error } = await supabase
    .from("follows").insert({ follower_id: userId, followee_id: targetId });
  // 23505 is a duplicate key: already following, so treat as success.
  // 42501 is the restrictive "no follows across a block" policy - surface
  // that as an actual message rather than a raw Postgres error string.
  if (error) {
    if (error.code === "23505") return;
    if (error.code === "42501") throw new Error("Couldn't follow - one of you has blocked the other");
    throw error;
  }
}

// ---------- BLOCKS ----------
// Removes any existing follow both ways and stops a new one forming in
// either direction (enforced in schema.sql, not just here) - doesn't
// touch is_public visibility, so Best in the Land and a public profile
// stay exactly as visible as before. Blocking is about the social graph,
// not app-wide public content.
export async function blockUser(blockerId, blockedId) {
  if (blockedId === blockerId) throw new Error("You can't block yourself");
  const { error } = await supabase.from("blocks").insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error && error.code !== "23505") throw error;
  await Promise.all([
    supabase.from("follows").delete().eq("follower_id", blockerId).eq("followee_id", blockedId),
    supabase.from("follows").delete().eq("follower_id", blockedId).eq("followee_id", blockerId),
  ]);
}

export async function unblockUser(blockerId, blockedId) {
  const { error } = await supabase.from("blocks").delete().eq("blocker_id", blockerId).eq("blocked_id", blockedId);
  if (error) throw error;
}

export async function loadBlockedUsers(userId) {
  const { data, error } = await supabase
    .from("blocks")
    .select("blocked_id, created_at, profiles!blocks_blocked_id_fkey(username, display_name)")
    .eq("blocker_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map((b) => ({
    id: b.blocked_id,
    name: b.profiles?.display_name || b.profiles?.username || "Unknown",
    blockedAt: b.created_at,
  }));
}

export async function followByUsername(userId, username) {
  const { data: target, error: tErr } = await supabase
    .from("profiles").select("id").eq("username", username.trim().toLowerCase()).single();
  if (tErr) throw new Error("No one by that name");
  await followUser(userId, target.id);
  return target.id;
}

// Who follows ME - the other half of the Court relationship, which until
// now had no way to even be seen, let alone followed back. alreadyFollowing
// lets the UI hide "follow back" once it's already mutual.
export async function loadFollowers(userId) {
  const [followersRes, myFollowingRes] = await Promise.all([
    supabase
      .from("follows")
      .select("follower_id, profiles!follows_follower_id_fkey(id, username, display_name, is_owner)")
      .eq("followee_id", userId),
    supabase.from("follows").select("followee_id").eq("follower_id", userId),
  ]);
  if (followersRes.error) throw followersRes.error;

  const followingSet = new Set((myFollowingRes.data || []).map((f) => f.followee_id));
  return followersRes.data.map((f) => {
    const p = f.profiles;
    return {
      id: p.id,
      name: p.display_name || p.username,
      username: p.username,
      isOwner: p.is_owner,
      alreadyFollowing: followingSet.has(p.id),
    };
  });
}

// ---------- NOTIFICATIONS ----------

// Five things worth a bell icon for: someone new following you, anyone you
// follow crowning (or re-crowning, via a coup) a restaurant, anyone you
// follow marking a place visited, someone endorsing one of YOUR picks, and
// a friend getting promoted. Computed on read from data that already
// exists (rank_promotions is the one exception - see its own comment in
// schema.sql, a promotion has no other historical trail to read back) -
// no separate unread-tracking scheme. A private Court member's crowns are
// correctly invisible here too, for free: thrones RLS already hides them
// from everyone but the owner, same as everywhere else in the app.
// `prefs` (a profile row, or any object with these four booleans) lets
// someone turn a type off entirely - defaults to all-on, and a disabled
// type skips its query rather than just hiding the result.
//
// This is a real scrollable feed, not a disappearing unread queue - every
// query below is windowed to FEED_WINDOW_MS regardless of `since`, which
// is only used to flag `isNew` (for the bell's red dot) on each item.
// Opening the bell marks `since` forward for the NEXT load, but it was
// previously also what GATED the query itself - meaning anything already
// seen once was gone for good on the next page load, which is why this
// never felt like a real feed to look back through.
//
// Product announcements ride the same list, sourced from CHANGELOG
// (./changelog) - the same list the monthly re-engagement email reads
// from, so a shipped feature is only ever logged once.
const FEED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const FEED_LIMIT = 50;

export async function loadNotifications(userId, since, prefs = {}) {
  const sinceIso = since || new Date(0).toISOString();
  const windowIso = new Date(Date.now() - FEED_WINDOW_MS).toISOString();
  const {
    notify_follows: notifyFollows = true,
    notify_crowns: notifyCrowns = true,
    notify_reviews: notifyReviews = true,
    notify_endorsements: notifyEndorsements = true,
  } = prefs;

  const [followersRes, followingRes, myThronesRes] = await Promise.all([
    notifyFollows
      ? supabase
          .from("follows")
          .select("created_at, profiles!follows_follower_id_fkey(username, display_name)")
          .eq("followee_id", userId)
          .gt("created_at", windowIso)
      : { data: [] },
    supabase.from("follows").select("followee_id").eq("follower_id", userId),
    // Needed for endorsement notifications below - endorsements only store
    // a throne_id, so this is how a notification learns which of MY places
    // just got endorsed.
    notifyEndorsements ? supabase.from("thrones").select("id, place_name, cuisines(name)").eq("user_id", userId) : { data: [] },
  ]);
  if (followersRes.error) throw followersRes.error;
  if (followingRes.error) throw followingRes.error;
  if (myThronesRes.error) throw myThronesRes.error;

  const followingIds = (followingRes.data || []).map((f) => f.followee_id);
  const myThroneById = Object.fromEntries((myThronesRes.data || []).map((t) => [t.id, t]));
  const myThroneIds = Object.keys(myThroneById);

  let crowns = [], reviews = [], promotions = [];
  if (followingIds.length) {
    const [crownsRes, reviewsRes, promotionsRes] = await Promise.all([
      notifyCrowns
        ? supabase
            .from("thrones")
            .select("crowned_at, place_name, cuisines(name), profiles!thrones_user_id_fkey(username, display_name)")
            .in("user_id", followingIds)
            .gt("crowned_at", windowIso)
        : { data: [] },
      // RLS ("followers see visited picks") already limits this to rows
      // with visited_at set for people you follow, so no extra filter needed.
      notifyReviews
        ? supabase
            .from("next_in_line")
            .select("visited_at, place_name, cuisines(name), profiles!next_in_line_user_id_fkey(username, display_name)")
            .in("user_id", followingIds)
            .not("visited_at", "is", null)
            .gt("visited_at", windowIso)
        : { data: [] },
      supabase
        .from("rank_promotions")
        .select("promoted_at, rank_title, profiles!rank_promotions_user_id_fkey(username, display_name)")
        .in("user_id", followingIds)
        .gt("promoted_at", windowIso),
    ]);
    if (crownsRes.error) throw crownsRes.error;
    if (reviewsRes.error) throw reviewsRes.error;
    // rank_promotions may not exist yet on an older database - degrade to
    // just not showing promotions rather than breaking every notification.
    crowns = crownsRes.data;
    reviews = reviewsRes.data;
    promotions = promotionsRes.error ? [] : promotionsRes.data;
  }

  let endorsements = [];
  if (myThroneIds.length) {
    const { data, error } = await supabase
      .from("endorsements")
      .select("created_at, throne_id, profiles!endorsements_endorser_id_fkey(username, display_name)")
      .in("throne_id", myThroneIds)
      .gt("created_at", windowIso);
    if (error) throw error;
    endorsements = data;
  }

  // A stable fingerprint per item, not a foreign key - these come from
  // five different tables (plus CHANGELOG, which isn't a table at all),
  // so there's no single id column to point a dismissal at. Built from
  // the item's own fields rather than a database id for exactly that
  // reason; a genuine collision would need the same person to do the
  // same type of thing, to the same place/rank, at the exact same
  // timestamp, which isn't realistically possible.
  const keyFor = (item) => [item.type, item.at, item.name || "", item.place || item.rank || item.text || ""].join("|");

  const dismissedRes = await supabase
    .from("dismissed_notifications")
    .select("item_key")
    .eq("user_id", userId)
    .gt("dismissed_at", windowIso);
  // Degrades to "nothing dismissed" rather than breaking the whole feed
  // if this table doesn't exist yet on an older database.
  const dismissedKeys = new Set((dismissedRes.error ? [] : dismissedRes.data).map((d) => d.item_key));

  const items = [
    ...followersRes.data.map((f) => ({
      type: "follow",
      at: f.created_at,
      name: f.profiles.display_name || f.profiles.username,
    })),
    ...crowns.map((t) => ({
      type: "crown",
      at: t.crowned_at,
      name: t.profiles.display_name || t.profiles.username,
      cuisine: t.cuisines.name,
      place: t.place_name,
    })),
    ...reviews.map((r) => ({
      type: "review",
      at: r.visited_at,
      name: r.profiles.display_name || r.profiles.username,
      cuisine: r.cuisines?.name || null,
      place: r.place_name,
    })),
    ...endorsements.map((e) => ({
      type: "endorse",
      at: e.created_at,
      name: e.profiles.display_name || e.profiles.username,
      cuisine: myThroneById[e.throne_id]?.cuisines?.name || null,
      place: myThroneById[e.throne_id]?.place_name || null,
    })),
    ...promotions.map((p) => ({
      type: "promotion",
      at: p.promoted_at,
      name: p.profiles.display_name || p.profiles.username,
      rank: p.rank_title,
    })),
    ...CHANGELOG
      .filter((c) => new Date(c.at) > new Date(windowIso))
      .map((c) => ({ type: "announcement", at: c.at, text: `New: ${c.title} - ${c.desc}` })),
  ]
    .map((item) => ({ ...item, key: keyFor(item), isNew: new Date(item.at) > new Date(sinceIso) }))
    .filter((item) => !dismissedKeys.has(item.key))
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, FEED_LIMIT);

  return items;
}

// Best-effort, same reasoning as logRankPromotion below - a dismiss that
// silently fails to persist is a minor annoyance (it'll just reappear
// next load), not worth surfacing as an error to the person who just
// wanted it gone.
export async function dismissNotification(userId, itemKey) {
  const { error } = await supabase
    .from("dismissed_notifications")
    .upsert({ user_id: userId, item_key: itemKey }, { onConflict: "user_id,item_key" });
  if (error) throw error;
}

export async function dismissAllNotifications(userId, itemKeys) {
  if (!itemKeys.length) return;
  const { error } = await supabase
    .from("dismissed_notifications")
    .upsert(itemKeys.map((item_key) => ({ user_id: userId, item_key })), { onConflict: "user_id,item_key" });
  if (error) throw error;
}

// Logged right alongside persisting last_rank_min (see the promotion
// celebration's useEffect in app/page.js) - best-effort, since a friend
// never seeing "so-and-so got promoted" in their feed is a much smaller
// problem than the celebration itself failing to show.
export async function logRankPromotion(userId, rank) {
  const { error } = await supabase
    .from("rank_promotions")
    .insert({ user_id: userId, rank_min: rank.min, rank_title: rank.title });
  if (error) throw error;
}

export async function markNotificationsSeen(userId) {
  const { error } = await supabase
    .from("profiles")
    .update({ notifications_seen_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) throw error;
}

// ---------- FEEDBACK ----------

// user_agent and page are captured automatically rather than asked for -
// "what device were you on" is exactly the context that gets lost when
// bug reports come in as scattered texts.
export async function submitFeedback(userId, message, page) {
  const { error } = await supabase.from("feedback").insert({
    user_id: userId,
    message: message.trim(),
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    page: page || null,
  });
  if (error) throw error;
}

// ---------- DIRECTORY ----------

// Following someone means knowing their exact username - fine for a
// handful of friends who already have each other's links, a real barrier
// once the group grows. This lets anyone browse and follow from a list
// instead, but only surfaces people who've opted into "discoverable" -
// a separate, off-by-default flag from is_public. is_public governs
// whether your kingdom link and Court visibility work at all; being
// listed here for total strangers to stumble on is a bigger, deliberate
// ask, meant for the "I want to be found" public-figure case, not the
// default for a friends beta.
export async function loadDirectory(userId) {
  const [profilesRes, followingRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name, is_owner, avatar_url")
      .eq("discoverable", true)
      .neq("id", userId),
    supabase.from("follows").select("followee_id").eq("follower_id", userId),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (followingRes.error) throw followingRes.error;

  const followingSet = new Set((followingRes.data || []).map((f) => f.followee_id));
  return profilesRes.data
    .map((p) => ({
      id: p.id,
      name: p.display_name || p.username,
      username: p.username,
      isOwner: p.is_owner,
      avatarUrl: p.avatar_url || null,
      alreadyFollowing: followingSet.has(p.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// "People you may know" via mutual Court connections - someone your own
// followees follow, that you don't follow yet. Safer to surface widely
// than the open directory above, since it's grounded in a real existing
// relationship rather than a stranger opting into global visibility;
// still excludes anyone fully private (neither public nor discoverable)
// out of caution, since they haven't consented to being surfaced at all.
export async function loadSuggestedFriends(userId) {
  const { data: myFollows, error: mfErr } = await supabase
    .from("follows").select("followee_id").eq("follower_id", userId);
  if (mfErr) throw mfErr;
  const myFolloweeIds = (myFollows || []).map((f) => f.followee_id);
  if (myFolloweeIds.length === 0) return [];

  const { data: theirFollows, error: tfErr } = await supabase
    .from("follows")
    .select("followee_id, profiles!follows_followee_id_fkey(id, username, display_name, is_owner, avatar_url, is_public, discoverable)")
    .in("follower_id", myFolloweeIds);
  if (tfErr) throw tfErr;

  const myFolloweeSet = new Set(myFolloweeIds);
  const candidates = new Map();
  for (const row of theirFollows) {
    const p = row.profiles;
    if (!p || p.id === userId || myFolloweeSet.has(p.id)) continue;
    if (!p.is_public && !p.discoverable) continue;
    if (!candidates.has(p.id)) candidates.set(p.id, { profile: p, mutualCount: 0 });
    candidates.get(p.id).mutualCount += 1;
  }

  return Array.from(candidates.values())
    .map(({ profile: p, mutualCount }) => ({
      id: p.id,
      name: p.display_name || p.username,
      username: p.username,
      isOwner: p.is_owner,
      avatarUrl: p.avatar_url || null,
      mutualCount,
    }))
    .sort((a, b) => b.mutualCount - a.mutualCount || a.name.localeCompare(b.name))
    .slice(0, 20);
}

// ---------- TRENDING (most crowned, by time range) ----------

// The place lookup is a Claude web search today, not the real Google
// Places API, so there's no reliable place ID to group by - every throne
// only ever has a name and an address as free text. Grouping on those,
// normalized, is good enough for a small beta group; it'll under-count a
// restaurant two people typed noticeably differently, but that's a
// reasonable trade for not needing a second, billed Google API.
// RLS on thrones already limits this to public profiles plus the
// caller's own, so no separate privacy filtering is needed here.
//
// Takes raw rows rather than doing the query itself, because "most
// crowned" depends on which time range is selected - the Trending tab
// fetches every crowned_at once (loadCrownedThrones below) and re-groups
// client-side each time the range or city filter changes, rather than
// re-querying Supabase for every dropdown change.
// Same normalization used by the Next in Line "a friend's been here too"
// cross-reference in app/page.js - kept in one place so the two features
// can never quietly disagree on what counts as the same restaurant.
//
// Two people typing the same real address rarely type it identically -
// one adds ", Toronto", another tacks on a postal code, a third just
// leaves it off. None of that is part of the street address, so strip it
// before comparing rather than requiring a byte-for-byte match.
//
// The other common mismatch is the street type/direction itself - "Queen
// St W" vs "Queen Street West" is the exact same address but fails a
// plain string match, which is what actually caused Lady Marmalade to
// split into two separate entries once already. Collapse both spellings
// to one short form per word before comparing.
const STREET_WORD = {
  street: "st", avenue: "ave", boulevard: "blvd", drive: "dr", road: "rd",
  place: "pl", lane: "ln", court: "ct", crescent: "cres", terrace: "terr",
  west: "w", east: "e", north: "n", south: "s",
};
const normalizeAddressPart = (address) => {
  if (!address) return "";
  const street = address.split(",")[0];
  return street
    .toLowerCase()
    .replace(/[a-z]\d[a-z]\s?\d[a-z]\d\s*$/i, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => STREET_WORD[word] || word)
    .join(" ");
};

const normalizeNamePart = (name) =>
  (name || "")
    .toLowerCase()
    .trim()
    .replace(/[\s\-–—:,.]+$/, "")
    .replace(/\s+/g, " ");

export function placeKey(name, address, area) {
  const addr = normalizeAddressPart(address) || normalizeAddressPart(area);
  return `${normalizeNamePart(name)}|${addr}`;
}

export function groupCrownedThrones(rows) {
  const groups = new Map();
  for (const t of rows) {
    const key = placeKey(t.place_name, t.address, t.neighbourhood);
    if (!groups.has(key)) {
      groups.set(key, {
        name: t.place_name,
        area: t.neighbourhood || null,
        address: t.address || null,
        rating: t.rating || null,
        mapsUrl: t.maps_url || null,
        crownedBy: new Set(),
      });
    }
    groups.get(key).crownedBy.add(t.user_id);
  }

  return Array.from(groups.values())
    .map(({ crownedBy, ...g }) => ({ ...g, count: crownedBy.size }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export async function loadCrownedThrones() {
  const { data, error } = await supabase
    .from("thrones")
    .select("user_id, place_name, address, neighbourhood, rating, maps_url, crowned_at");
  if (error) throw error;
  return data;
}

// Every DineSafe-sourced restaurant, crowned or not. Best in the Land's
// own search would otherwise only ever surface places someone's already
// crowned - which quietly buries anything new, or anything nobody's
// gotten to yet while the app is still small, exactly the "new
// restaurants get penalized" problem this exists to avoid.
export async function searchAllRestaurants(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from("restaurants")
    .select("name, address, neighbourhood")
    .ilike("name", `%${q}%`)
    .limit(20);
  if (error) throw error;
  return data.map((r) => ({ name: r.name, address: r.address, area: r.neighbourhood }));
}

// A restaurant's own page: every crown on it app-wide, not just the
// signed-in user's Court - matched by the same placeKey identity Trending
// uses, so "open this restaurant" and "how many crowns does Trending say
// it has" can never quietly disagree. RLS on thrones already limits this
// query to the caller's own rows plus public profiles' rows, same as
// Trending gets for free, so no extra privacy filtering belongs here.
export async function loadRestaurantProfile(name, address, area) {
  const { data, error } = await supabase
    .from("thrones")
    .select("id, place_name, address, neighbourhood, rating, maps_url, decree, photos, crowned_at, cuisines(name), profiles!thrones_user_id_fkey(username, display_name, avatar_url)")
    .ilike("place_name", `%${name}%`);
  if (error) throw error;

  const key = placeKey(name, address, area);
  return data
    .filter((t) => placeKey(t.place_name, t.address, t.neighbourhood) === key)
    .map((t) => ({
      id: t.id,
      username: t.profiles?.username || null,
      displayName: t.profiles?.display_name || null,
      avatarUrl: t.profiles?.avatar_url || null,
      cuisine: t.cuisines?.name || null,
      rating: t.rating,
      mapsUrl: t.maps_url,
      decree: t.decree,
      photos: t.photos || [],
      crownedAt: new Date(t.crowned_at).getTime(),
    }))
    .sort((a, b) => b.crownedAt - a.crownedAt);
}

// A plain count, not individual rows - next_in_line's own RLS would only
// ever show a fraction of everyone who's actually visited (your own rows
// plus people you follow), so this calls the security-definer count
// function in schema.sql instead of querying the table directly.
export async function loadRestaurantVisitCount(name, address, area) {
  const { data, error } = await supabase.rpc("restaurant_visit_count", {
    p_name: name,
    p_address: address || null,
    p_area: area || null,
  });
  if (error) throw error;
  return data || 0;
}

// Same as above, the other half of next_in_line - people who've added
// this place but haven't been yet ("want to try").
export async function loadRestaurantWantingCount(name, address, area) {
  const { data, error } = await supabase.rpc("restaurant_wanting_count", {
    p_name: name,
    p_address: address || null,
    p_area: area || null,
  });
  if (error) throw error;
  return data || 0;
}

// ---------- STANDING ----------

export async function loadStanding(userId) {
  const { data, error } = await supabase
    .from("standings").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

// ---------- CONQUESTS (one-time achievements) ----------
// Each is a fact about existing data ("ever held 2+ cuisines", "ever
// added a photo"), not an event - so rather than firing these off the
// moment something happens, loadConquestProgress re-checks all of them
// every time the profile is opened, and records (in the conquests table)
// whichever just became true for the first time. That keeps the whole
// system a handful of read queries and one insert, no triggers.
export const CONQUESTS = [
  { key: "first_blood", title: "First Blood", desc: "Crown your first restaurant", points: 5 },
  { key: "new_territory", title: "Conquer New Territory", desc: "Hold two different cuisines (ever, not just right now)", points: 8 },
  { key: "say_something", title: "Say Something", desc: "Write a decree over 100 words", points: 8 },
  { key: "picture_worth", title: "Picture Worth a Thousand Words", desc: "Add a photo to a review", points: 8 },
  { key: "stage_a_coup", title: "Stage a Coup", desc: "Dethrone a restaurant for the first time", points: 8 },
  { key: "build_your_court", title: "Build Your Court", desc: "Follow 3 people", points: 8 },
  { key: "full_house", title: "Full House", desc: "Fill every cuisine slot in your Kingdom", points: 15 },
  { key: "seal_of_approval", title: "Seal of Approval", desc: "Endorse 3 friends' picks", points: 8 },
];

export async function loadConquestProgress(userId) {
  const [thronesRes, fallenRes, followingRes, endorsementsRes, completedRes, cuisinesRes, profileRes] = await Promise.all([
    supabase.from("thrones").select("cuisine_id, decree, photos").eq("user_id", userId),
    supabase.from("fallen").select("cuisine_id").eq("user_id", userId),
    supabase.from("follows").select("followee_id").eq("follower_id", userId),
    supabase.from("endorsements").select("throne_id").eq("endorser_id", userId),
    supabase.from("conquests").select("key").eq("user_id", userId),
    supabase.from("cuisines").select("id"),
    supabase.from("profiles").select("hidden_cuisine_ids").eq("id", userId).single(),
  ]);
  for (const r of [thronesRes, fallenRes, followingRes, endorsementsRes, completedRes, cuisinesRes, profileRes]) {
    if (r.error) throw r.error;
  }

  const thrones = thronesRes.data;
  const everHeldCuisines = new Set([...thrones.map((t) => t.cuisine_id), ...fallenRes.data.map((f) => f.cuisine_id)]);
  const hiddenIds = new Set(profileRes.data?.hidden_cuisine_ids || []);
  const visibleCuisineCount = cuisinesRes.data.filter((c) => !hiddenIds.has(c.id)).length;
  const completedKeys = new Set(completedRes.data.map((c) => c.key));

  const eligible = {
    first_blood: thrones.length >= 1,
    new_territory: everHeldCuisines.size >= 2,
    say_something: thrones.some((t) => (t.decree || "").trim().split(/\s+/).filter(Boolean).length >= 100),
    picture_worth: thrones.some((t) => (t.photos || []).length > 0),
    stage_a_coup: fallenRes.data.length >= 1,
    build_your_court: followingRes.data.length >= 3,
    full_house: visibleCuisineCount > 0 && thrones.length >= visibleCuisineCount,
    seal_of_approval: endorsementsRes.data.length >= 3,
  };

  const newlyCompleted = CONQUESTS.filter((c) => eligible[c.key] && !completedKeys.has(c.key));
  if (newlyCompleted.length > 0) {
    const { error } = await supabase.from("conquests").insert(
      newlyCompleted.map((c) => ({ user_id: userId, key: c.key, points: c.points }))
    );
    if (!error) newlyCompleted.forEach((c) => completedKeys.add(c.key));
  }

  return CONQUESTS.map((c) => ({ ...c, completed: completedKeys.has(c.key) }));
}

// ---------- PUBLIC PROFILE (nomarchy.app/steve) ----------

export async function loadPublicKingdom(username) {
  const { data: profile, error } = await supabase
    .from("profiles").select("id, username, display_name, city, is_owner, is_public, avatar_url")
    .eq("username", username).single();
  if (error) return null;
  const slots = await loadKingdom(profile.id);
  const standing = await loadStanding(profile.id);
  return { profile, slots, standing };
}

// ---------- ADMIN (owner-only) ----------
// Everything here relies on RLS actually restricting it server-side (the
// thrones/feedback owner-bypass policies in schema.sql, and the
// /api/admin/overview route's own is_owner check) - the UI hiding the tab
// from non-owners is a convenience, not the real access control.

export async function loadAdminOverview() {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch("/api/admin/overview", {
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't load admin data");
  const { users: authUsers } = await res.json();
  const authById = new Map(authUsers.map((u) => [u.id, u]));

  const [profilesRes, thronesRes, feedbackRes, sourcesRes] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, created_at, onboarded, is_public, discoverable"),
    supabase.from("thrones").select("place_name, cuisines(name)"),
    supabase.from("feedback").select("id, message, page, created_at, profiles(username)").order("created_at", { ascending: false }),
    // Owner-only table (see signup_sources in schema.sql). If it doesn't
    // exist yet, the admin tab still loads - everyone just shows as unknown.
    supabase.from("signup_sources").select("user_id, source"),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (thronesRes.error) throw thronesRes.error;
  if (feedbackRes.error) throw feedbackRes.error;

  const now = Date.now();
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  const sourceByUser = new Map((sourcesRes.error ? [] : sourcesRes.data).map((r) => [r.user_id, r.source]));

  const users = profilesRes.data
    .map((p) => {
      const auth = authById.get(p.id);
      return {
        id: p.id,
        source: sourceByUser.get(p.id) || null,
        username: p.username,
        displayName: p.display_name,
        createdAt: new Date(p.created_at).getTime(),
        onboarded: p.onboarded,
        isPublic: p.is_public,
        discoverable: p.discoverable,
        email: auth?.email || null,
        lastSignInAt: auth?.lastSignInAt ? new Date(auth.lastSignInAt).getTime() : null,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  // Signups by source: any valid tag that's come in (not just the usual
  // six), busiest first, with "unknown" - everyone from before tracking
  // began, plus anyone who arrived with no tag - kept separate at the end.
  const sourceCounts = new Map();
  let unknownWeek = 0;
  let unknownAllTime = 0;
  for (const u of users) {
    const isWeek = now - u.createdAt < SEVEN_DAYS_MS;
    if (!u.source) {
      unknownAllTime += 1;
      if (isWeek) unknownWeek += 1;
      continue;
    }
    const row = sourceCounts.get(u.source) || { source: u.source, week: 0, allTime: 0 };
    row.allTime += 1;
    if (isWeek) row.week += 1;
    sourceCounts.set(u.source, row);
  }
  const signupSources = {
    rows: Array.from(sourceCounts.values()).sort((a, b) => b.allTime - a.allTime || a.source.localeCompare(b.source)),
    unknown: { week: unknownWeek, allTime: unknownAllTime },
  };

  const placeCounts = new Map();
  const cuisineCounts = new Map();
  for (const t of thronesRes.data) {
    placeCounts.set(t.place_name, (placeCounts.get(t.place_name) || 0) + 1);
    const cuisineName = t.cuisines?.name;
    if (cuisineName) cuisineCounts.set(cuisineName, (cuisineCounts.get(cuisineName) || 0) + 1);
  }
  const rank = (m) => Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));

  return {
    users,
    stats: {
      totalUsers: users.length,
      activeLast30d: users.filter((u) => u.lastSignInAt && now - u.lastSignInAt < THIRTY_DAYS_MS).length,
      newThisWeek: users.filter((u) => now - u.createdAt < SEVEN_DAYS_MS).length,
      totalCrowns: thronesRes.data.length,
    },
    signupSources,
    topPlaces: rank(placeCounts),
    topCuisines: rank(cuisineCounts),
    feedback: feedbackRes.data.map((f) => ({
      id: f.id,
      message: f.message,
      page: f.page,
      username: f.profiles?.username || null,
      createdAt: new Date(f.created_at).getTime(),
    })),
  };
}
