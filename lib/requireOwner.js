// Shared by the owner-only admin routes: checks the caller's own is_owner
// flag using their own token, and only then hands back a service-role
// client (which bypasses RLS). Anyone else gets a 401 or 403 response.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function requireOwner(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: userData } = await anon.auth.getUser(token);
  if (!userData.user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };

  const { data: profile, error: profileErr } = await anon
    .from("profiles")
    .select("is_owner")
    .eq("id", userData.user.id)
    .single();
  if (profileErr || !profile?.is_owner) {
    return { error: NextResponse.json({ error: "Not authorized" }, { status: 403 }) };
  }
  return { admin: createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY) };
}
