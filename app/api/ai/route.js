// ============================================================
// Server-side AI route.
//
// WHY THIS FILE EXISTS: in the prototype, the place lookup and list import
// called api.anthropic.com directly from the browser. In production that
// would expose your API key to anyone who opens dev tools, and stolen keys
// get drained within hours. This route keeps the key on the server.
//
// The browser calls /api/ai. Only this file ever sees the key.
//
// Runtime note: Next.js 16 deprecates `export const runtime = "edge"` for
// route handlers (nodejs is the default and the only supported option
// going forward - see node_modules/next/dist/docs/.../route-segment-config
// /runtime.md). That also removes the temptation to rate-limit with an
// in-memory Map, which never actually worked reliably across edge
// instances anyway - the ai_calls table below is the real rate limiter.
// ============================================================

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5";
const MAX_IMPORT_CHARS = 8000;
const HOURLY_CALL_LIMIT = 30;

const anthropic = new Anthropic();

function supabaseForToken(token) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

async function requireUser(token) {
  const supabase = supabaseForToken(token);
  const { data } = await supabase.auth.getUser(token);
  return { user: data.user ?? null, supabase };
}

function extractJsonArray(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function POST(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { user, supabase } = await requireUser(token);
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Rate limit is enforced against the database, not an in-memory counter,
  // so it holds up across serverless instances and server restarts.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("ai_calls")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("called_at", oneHourAgo);
  if (countError) {
    return NextResponse.json({ error: "Could not check rate limit" }, { status: 500 });
  }
  if ((count ?? 0) >= HOURLY_CALL_LIMIT) {
    return NextResponse.json({ error: "Slow down, try again later" }, { status: 429 });
  }

  const { mode, query, city, raw, cuisines } = await request.json();

  try {
    let result;
    if (mode === "lookup") {
      if (!query?.trim()) return NextResponse.json({ error: "No query" }, { status: 400 });
      result = await handleLookup(query, city);
    } else if (mode === "import") {
      if (!raw?.trim()) return NextResponse.json({ error: "Nothing to import" }, { status: 400 });
      result = await handleImport(raw, cuisines);
    } else {
      return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
    }

    await supabase.from("ai_calls").insert({ user_id: user.id });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message ?? "Something went wrong" }, { status: 502 });
  }
}

async function handleLookup(query, city) {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1200,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    messages: [
      {
        role: "user",
        content:
          `Search the web for the restaurant "${query.trim()}" in ${city?.trim() || "Toronto"}. ` +
          `Find up to 3 real matching restaurants, exact match first. ` +
          `Respond with ONLY a raw JSON array, no markdown fences: ` +
          `[{"name":"...","address":"street address","neighbourhood":"short name","rating":"4.5",` +
          `"mapsUrl":"https://www.google.com/maps/search/?api=1&query=URLENCODED"}]. ` +
          `Empty string for unknown fields. If nothing matches, respond with [].`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return { results: extractJsonArray(text).slice(0, 3) };
}

async function handleImport(raw, cuisines) {
  const capped = raw.slice(0, MAX_IMPORT_CHARS);
  const cuisineNames = Array.isArray(cuisines) ? cuisines : [];

  const schema = {
    type: "object",
    properties: {
      entries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            cuisine: { type: "string" },
            area: { type: "string" },
            note: { type: "string" },
          },
          required: ["name", "cuisine", "area", "note"],
          additionalProperties: false,
        },
      },
    },
    required: ["entries"],
    additionalProperties: false,
  };

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { format: { type: "json_schema", schema } },
    messages: [
      {
        role: "user",
        content:
          `Below is a messy personal list of restaurants pasted from notes, a spreadsheet or a CSV. ` +
          `Extract every restaurant into structured data. Infer the cuisine from the name or context. ` +
          `Use one of these where it fits: ${cuisineNames.join(", ")}. If none fit, use a short label of your own. ` +
          `Keep any personal comment as the note. Use an empty string for area or note when there isn't one. ` +
          `Ignore headers, blank lines, numbering and junk.\n\n` +
          `THE LIST:\n${capped}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const parsed = JSON.parse(textBlock?.text ?? "{}");
  return { results: Array.isArray(parsed.entries) ? parsed.entries : [] };
}
