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

// Import is a batch, wait-a-moment task where getting cuisines right
// matters most, so it stays on Opus. Lookup happens mid-flow while
// someone's filling out a crown/next-in-line form and needs to feel fast -
// it's also a narrower task (search + extract up to 3 matches), so a
// lighter model at lower effort is the right trade there, not a downgrade
// for its own sake.
const IMPORT_MODEL = "claude-opus-5";
const LOOKUP_MODEL = "claude-sonnet-5";
const MAX_IMPORT_CHARS = 20000;
const HOURLY_CALL_LIMIT = 30;

// Claude Opus 5 thinks by default, and those thinking tokens count against
// max_tokens - a low cap here doesn't just clip the answer, it can eat the
// whole budget during thinking and leave nothing but an empty response.
// Give it real headroom; billing is by tokens actually used, not this cap.
const MAX_OUTPUT_TOKENS = 16000;

// Give slow web-search-backed lookups room to finish instead of Vercel
// killing the function mid-request (which produces a truncated/empty
// response the client can't parse).
export const maxDuration = 60;

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
    let cached = false;
    if (mode === "lookup") {
      if (!query?.trim()) return NextResponse.json({ error: "No query" }, { status: 400 });
      ({ result, cached } = await handleLookup(supabase, query, city));
    } else if (mode === "import") {
      if (!raw?.trim()) return NextResponse.json({ error: "Nothing to import" }, { status: 400 });
      result = await handleImport(raw, cuisines);
    } else {
      return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
    }

    // A cache hit didn't cost an actual AI call, so it shouldn't eat into
    // the user's hourly budget.
    if (!cached) {
      await supabase.from("ai_calls").insert({ user_id: user.id });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message ?? "Something went wrong" }, { status: 502 });
  }
}

function lookupCacheKey(query, city) {
  return `${query.trim().toLowerCase()}|${(city || "").trim().toLowerCase()}`;
}

async function handleLookup(supabase, query, city) {
  const queryKey = lookupCacheKey(query, city);

  // The first person to search for a place pays the ~10-20s web-search
  // cost; everyone after that (any user, since restaurant existence isn't
  // sensitive) gets an instant cached answer.
  const { data: cachedRow } = await supabase
    .from("place_lookup_cache")
    .select("results")
    .eq("query_key", queryKey)
    .maybeSingle();
  if (cachedRow) {
    return { result: { results: cachedRow.results }, cached: true };
  }

  const response = await anthropic.messages.create({
    model: LOOKUP_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    output_config: { effort: "low" },
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

  if (response.stop_reason === "max_tokens") {
    throw new Error("That search took too long to answer. Try again.");
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const results = extractJsonArray(text).slice(0, 3);

  // Only cache real matches - an empty/failed search shouldn't get stuck
  // permanently returning nothing for everyone who searches it later.
  if (results.length > 0) {
    await supabase.from("place_lookup_cache").upsert(
      { query_key: queryKey, results },
      { onConflict: "query_key" }
    );
  }

  return { result: { results }, cached: false };
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
    model: IMPORT_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    output_config: { format: { type: "json_schema", schema } },
    messages: [
      {
        role: "user",
        content:
          `Below is a messy personal list of restaurants pasted from notes, a spreadsheet or a CSV. ` +
          `Extract every restaurant into structured data. Only set a cuisine when the text itself states or ` +
          `clearly tags it (e.g. "- pizza", "(thai)", "sunny's chinese"). Do not guess a cuisine purely from a ` +
          `restaurant's name or brand association - if it isn't stated, leave the cuisine field as an empty ` +
          `string and let a person categorize it later. When a cuisine is stated, use one of these where it ` +
          `fits: ${cuisineNames.join(", ")}; otherwise use the short label as written. ` +
          `Keep any personal comment as the note. Use an empty string for area or note when there isn't one. ` +
          `Ignore headers, blank lines, numbering, checkboxes and other list-formatting junk. ` +
          `The name field must be just the restaurant's name: trim whitespace, drop trailing punctuation like a ` +
          `stray hyphen, and if the line has a trailing " - <neighbourhood>" or ", <neighbourhood>" suffix, move ` +
          `that into area instead of leaving it stuck in the name.\n\n` +
          `THE LIST:\n${capped}`,
      },
    ],
  });

  if (response.stop_reason === "max_tokens") {
    throw new Error("That list took too long to sort out. Try a shorter paste, or try again.");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  let parsed;
  try {
    parsed = JSON.parse(textBlock?.text ?? "{}");
  } catch {
    throw new Error("Couldn't read the AI's response. Try again.");
  }
  return { results: Array.isArray(parsed.entries) ? parsed.entries : [] };
}
