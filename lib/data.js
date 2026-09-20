// ============================================================
// NOMARCHY data layer
// This file replaces every window.storage.get / window.storage.set call
// from the prototype. Same shapes going in and out, so the UI barely changes.
// ============================================================

import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ---------- AUTH ----------

// Magic link. No passwords to manage, no reset flow to build.
export async function signIn(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
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

export async function signOut() {
  await supabase.auth.signOut();
}

// Deleting the actual auth.users row (not something the anon key can do -
// needs the service role, kept server-side in /api/delete-account) cascades
// through profiles to every table that references it: thrones, fallen,
// next_in_line, endorsements, follows, ai_calls. Nothing left behind.
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

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, city, is_owner, is_public")
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
    .select("id, username, display_name, city, is_owner, is_public")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("That username is already taken.");
    throw error;
  }
  return data;
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
      decree: t.decree,
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

// Crowning and staging a coup are the SAME operation.
// upsert on (user_id, cuisine_id) means: insert if the throne is empty,
// update if it's occupied. The database trigger archives the old monarch
// into `fallen` automatically, so there's no separate coup code path.
export async function crownSpot(userId, cuisineId, place) {
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
        rating: place.rating ? Number(place.rating) : null,
        maps_url: place.mapsUrl || null,
        lat: place.lat || null,
        lng: place.lng || null,
        decree: place.decree,
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
    cuisine: r.cuisines?.name || null,
    cuisineId: r.cuisine_id,
    note: r.note,
    addedAt: new Date(r.added_at).getTime(),
    visitedAt: r.visited_at ? new Date(r.visited_at).getTime() : null,
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

export async function addToNextInLine(userId, place) {
  const { data, error } = await supabase
    .from("next_in_line")
    .insert({
      user_id: userId,
      cuisine_id: place.cuisineId || null,
      google_place_id: place.googlePlaceId || null,
      place_name: place.name,
      address: place.address || null,
      neighbourhood: place.area || null,
      rating: place.rating ? Number(place.rating) : null,
      maps_url: place.mapsUrl || null,
      note: place.note || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Bulk import. One insert call, not one per row, so a 40 item paste
// is a single round trip. Dedupe on the client before calling this.
export async function importToNextInLine(userId, rows) {
  const { data, error } = await supabase
    .from("next_in_line")
    .insert(
      rows.map((r) => ({
        user_id: userId,
        cuisine_id: r.cuisineId || null,
        place_name: r.name,
        neighbourhood: r.area || null,
        note: r.note || null,
      }))
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
    .select("followee_id, profiles!follows_followee_id_fkey(id, username, display_name, is_owner)")
    .eq("follower_id", userId);
  if (fErr) throw fErr;
  if (!follows.length) return [];

  const ids = follows.map((f) => f.followee_id);
  const [thronesRes, standingsRes, myEndorsements] = await Promise.all([
    supabase.from("thrones").select("*, cuisines(name)").in("user_id", ids),
    supabase.from("standings").select("*").in("id", ids),
    supabase.from("endorsements").select("throne_id").eq("endorser_id", userId),
  ]);
  if (thronesRes.error) throw thronesRes.error;

  const endorsedSet = new Set((myEndorsements.data || []).map((e) => e.throne_id));
  const standings = Object.fromEntries((standingsRes.data || []).map((s) => [s.id, s]));

  return follows.map((f) => {
    const p = f.profiles;
    return {
      id: p.id,
      name: p.display_name || p.username,
      username: p.username,
      isOwner: p.is_owner,
      score: standings[p.id]?.score ?? 0,
      picks: thronesRes.data
        .filter((t) => t.user_id === p.id)
        .map((t) => ({
          id: t.id,
          cuisine: t.cuisines.name,
          cuisineId: t.cuisine_id,
          name: t.place_name,
          area: t.neighbourhood,
          decree: t.decree,
          endorsedByMe: endorsedSet.has(t.id),
        })),
    };
  });
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

export async function followByUsername(userId, username) {
  const { data: target, error: tErr } = await supabase
    .from("profiles").select("id").eq("username", username.trim().toLowerCase()).single();
  if (tErr) throw new Error("No one by that name");
  if (target.id === userId) throw new Error("You can't follow yourself");
  const { error } = await supabase
    .from("follows").insert({ follower_id: userId, followee_id: target.id });
  if (error && error.code !== "23505") throw error;
  return target.id;
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

// ---------- OWNER: NEW MEMBERS ----------

// A quick beta-tracking convenience, not a real admin system - profiles is
// already public-read (needed for public profile pages, Court, follows),
// so this is just gating the UI to the owner rather than adding new RLS
// for data that's already visible elsewhere in the app.
export async function loadRecentMembers(limit = 50) {
  const { data, error } = await supabase
    .from("profiles")
    .select("username, display_name, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// ---------- STANDING ----------

export async function loadStanding(userId) {
  const { data, error } = await supabase
    .from("standings").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

// ---------- PUBLIC PROFILE (nomarchy.app/steve) ----------

export async function loadPublicKingdom(username) {
  const { data: profile, error } = await supabase
    .from("profiles").select("id, username, display_name, city, is_owner, is_public")
    .eq("username", username).single();
  if (error) return null;
  const slots = await loadKingdom(profile.id);
  const standing = await loadStanding(profile.id);
  return { profile, slots, standing };
}
