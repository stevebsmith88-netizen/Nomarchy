// ============================================================
// Owner-only: returns auth-level data the browser can never query itself
// (email, real last-sign-in time) for every user, to pair with the
// profiles data the admin dashboard already has client-side.
//
// auth.users isn't reachable through the regular Supabase client at all,
// regardless of RLS - only the service role key can list it, which is why
// this needs a route rather than a plain query in lib/data.js. The caller
// is verified as the actual owner (via their own token, on the anon-key
// client) before the service role key is ever used - never trusting a
// role flag the client claims about itself.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

async function listAllAuthUsers(admin) {
  const users = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    for (const u of data.users) {
      users.set(u.id, {
        email: u.email,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at,
      });
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  return users;
}

export async function GET(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: userData } = await anon.auth.getUser(token);
  if (!userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile, error: profileErr } = await anon
    .from("profiles")
    .select("is_owner")
    .eq("id", userData.user.id)
    .single();
  if (profileErr || !profile?.is_owner) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  let authUsers;
  try {
    authUsers = await listAllAuthUsers(admin);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  return NextResponse.json({
    users: Array.from(authUsers.entries()).map(([id, u]) => ({ id, ...u })),
  });
}
