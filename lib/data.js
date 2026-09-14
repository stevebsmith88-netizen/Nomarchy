import { supabase } from "./supabaseClient";

export async function signIn(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo:
        typeof window !== "undefined" ? window.location.origin : undefined,
    },
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function loadCuisines(userId) {
  const { data, error } = await supabase
    .from("cuisines")
    .select("id, name")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data;
}

export async function addCuisine(userId, name) {
  const { data, error } = await supabase
    .from("cuisines")
    .insert({ user_id: userId, name })
    .select("id, name")
    .single();
  if (error) throw error;
  return data;
}

// The kingdom: every cuisine the user has, each with its current throne
// holder (or null if nobody has been crowned yet).
export async function loadKingdom(userId) {
  const [{ data: cuisines, error: cuisinesError }, { data: thrones, error: thronesError }] =
    await Promise.all([
      supabase
        .from("cuisines")
        .select("id, name")
        .eq("user_id", userId)
        .order("name", { ascending: true }),
      supabase.from("thrones").select("*").eq("user_id", userId),
    ]);
  if (cuisinesError) throw cuisinesError;
  if (thronesError) throw thronesError;

  const throneByCuisine = new Map(thrones.map((t) => [t.cuisine_id, t]));

  return cuisines.map((cuisine) => {
    const throne = throneByCuisine.get(cuisine.id);
    return {
      id: cuisine.id,
      name: cuisine.name,
      throne: throne
        ? {
            restaurantName: throne.restaurant_name,
            placeId: throne.restaurant_place_id,
            address: throne.restaurant_address,
            decree: throne.decree,
            crownedAt: throne.crowned_at,
          }
        : null,
    };
  });
}

export async function loadNextInLine(userId) {
  const [{ data: rows, error }, { data: cuisines, error: cuisinesError }] =
    await Promise.all([
      supabase
        .from("next_in_line")
        .select("*")
        .eq("user_id", userId)
        .order("added_at", { ascending: true }),
      supabase.from("cuisines").select("id, name").eq("user_id", userId),
    ]);
  if (error) throw error;
  if (cuisinesError) throw cuisinesError;

  const nameByCuisine = new Map(cuisines.map((c) => [c.id, c.name]));

  return rows.map((row) => ({
    id: row.id,
    cuisineId: row.cuisine_id,
    cuisineName: nameByCuisine.get(row.cuisine_id) ?? "",
    restaurantName: row.restaurant_name,
    placeId: row.restaurant_place_id,
    address: row.restaurant_address,
    note: row.note,
    addedAt: row.added_at,
  }));
}

export async function addToNextInLine(userId, cuisineId, entry) {
  const { data, error } = await supabase
    .from("next_in_line")
    .insert({
      user_id: userId,
      cuisine_id: cuisineId,
      restaurant_name: entry.restaurantName,
      restaurant_place_id: entry.placeId ?? null,
      restaurant_address: entry.address ?? null,
      note: entry.note ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeFromNextInLine(id) {
  const { error } = await supabase.from("next_in_line").delete().eq("id", id);
  if (error) throw error;
}

// Crowning a restaurant is an upsert on the cuisine's throne. When a throne
// already exists this is an UPDATE, which fires the coup trigger and
// archives the outgoing restaurant into throne_history automatically.
export async function crownSpot(userId, cuisineId, entry) {
  const { data, error } = await supabase
    .from("thrones")
    .upsert(
      {
        user_id: userId,
        cuisine_id: cuisineId,
        restaurant_name: entry.restaurantName,
        restaurant_place_id: entry.placeId ?? null,
        restaurant_address: entry.address ?? null,
        decree: entry.decree,
        crowned_at: new Date().toISOString(),
      },
      { onConflict: "cuisine_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function promoteToThrone(userId, cuisineId, entry, fromListId) {
  await crownSpot(userId, cuisineId, entry);
  if (fromListId) {
    await removeFromNextInLine(fromListId);
  }
}

export async function loadHistory(userId, cuisineId) {
  const { data, error } = await supabase
    .from("throne_history")
    .select("*")
    .eq("user_id", userId)
    .eq("cuisine_id", cuisineId)
    .order("reign_ended_at", { ascending: false });
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    restaurantName: row.restaurant_name,
    address: row.restaurant_address,
    decree: row.decree,
    reignStartedAt: row.reign_started_at,
    reignEndedAt: row.reign_ended_at,
  }));
}

export async function loadStanding(userId) {
  const [{ data: cuisines, error: cuisinesError }, { data: thrones, error: thronesError }, { count: coupCount, error: historyError }] =
    await Promise.all([
      supabase.from("cuisines").select("id").eq("user_id", userId),
      supabase.from("thrones").select("*").eq("user_id", userId),
      supabase
        .from("throne_history")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
    ]);
  if (cuisinesError) throw cuisinesError;
  if (thronesError) throw thronesError;
  if (historyError) throw historyError;

  let longestReign = null;
  for (const throne of thrones) {
    const days = Math.floor(
      (Date.now() - new Date(throne.crowned_at).getTime()) / 86400000
    );
    if (!longestReign || days > longestReign.days) {
      longestReign = {
        cuisineId: throne.cuisine_id,
        restaurantName: throne.restaurant_name,
        days,
      };
    }
  }

  return {
    cuisineCount: cuisines.length,
    throneCount: thrones.length,
    coupCount: coupCount ?? 0,
    longestReign,
  };
}
