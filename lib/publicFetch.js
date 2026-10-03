// Server-side reads for public pages and their link previews, with the
// public (anon) key - so they see exactly what a signed-out visitor could.
import { createClient } from "@supabase/supabase-js";

function anon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
}

// One restaurant page's data (place_page in schema.sql), or null.
export async function fetchPlacePageData(slug) {
  try {
    const { data, error } = await anon().rpc("place_page", { p_slug: slug });
    return error ? null : data;
  } catch {
    return null;
  }
}

// The public parts of a profile, or null.
export async function fetchProfileForMeta(username) {
  try {
    const { data } = await anon().from("profiles").select("username, display_name, is_public").eq("username", username).single();
    return data || null;
  } catch {
    return null;
  }
}
