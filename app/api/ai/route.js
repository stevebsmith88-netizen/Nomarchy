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
import { searchGooglePlaces } from "../../../lib/googlePlaces";
import { logGoogleCall } from "../../../lib/googleUsage";

// Import is a batch, wait-a-moment task where getting cuisines right
// matters most, so it uses the Opus model. Lookup happens mid-flow while
// someone's filling out a crown/next-in-line form and needs to feel fast -
// it's also a narrower task (search + extract up to 3 matches), so a
// lighter model at low effort is the right trade there, not a downgrade
// for its own sake. Effort is set explicitly for each: the defaults differ
// between models.
const IMPORT_MODEL = "claude-opus-5-5";
const IMPORT_EFFORT = "medium";
const LOOKUP_MODEL = "claude-sonnet-5-5";
const LOOKUP_EFFORT = "low";
const MAX_IMPORT_CHARS = 20000;
const HOURLY_CALL_LIMIT = 30;

// If a request is declined by the model's safety checks, the API retries it
// on Anthropic's recommended fallback model instead of returning nothing.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

// Both models think before answering, and those thinking tokens count
// against max_tokens - a low cap here doesn't just clip the answer, it can
// eat the whole budget during thinking and leave nothing but an empty
// response. Give it real headroom; billing is by tokens actually used.
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

// The shared search cache is written only by this server (members can read
// it but not write it - see place_lookup_cache in schema.sql).
function serviceClient() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
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

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { mode, query, city, raw, cuisines } = payload;

  try {
    let result;
    let cached = false;
    if (mode === "lookup") {
      if (!query?.trim()) return NextResponse.json({ error: "No query" }, { status: 400 });
      ({ result, cached } = await handleLookup(supabase, query, city, user.id));
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
    // The real error can contain provider details; keep it in the server
    // logs and give the browser something generic.
    console.error("AI route failed", err?.message);
    return NextResponse.json({ error: "Something went wrong - try again" }, { status: 502 });
  }
}

function lookupCacheKey(query, city) {
  return `${query.trim().toLowerCase()}|${(city || "").trim().toLowerCase()}`;
}

// Checked before the AI web search (and before the cache, since it's
// even cheaper): a pre-loaded local table of real Toronto restaurants
// (see app/api/restaurants/import), so the common case - someone typing
// a real, already-known Toronto restaurant - never has to wait 10-20s
// for Claude's web search at all. Empty for any other city, or if the
// import hasn't been run yet, in which case this always falls through
// to the AI path exactly as before.
function toLocalResult(r) {
  return {
    name: r.name,
    address: r.address || "",
    neighbourhood: r.neighbourhood || "",
    rating: "",
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${r.name} ${r.address || ""}`)}`,
  };
}

async function searchLocalRestaurants(supabase, query, city) {
  if ((city || "Toronto").trim().toLowerCase() !== "toronto") return { results: [], fuzzy: false };
  const { data, error } = await supabase
    .from("restaurants")
    .select("name, address, neighbourhood")
    .eq("city", "Toronto")
    .ilike("name", `%${query.trim()}%`)
    .limit(3);
  if (!error && data?.length) {
    return { results: data.map(toLocalResult), fuzzy: false };
  }

  // Nothing matched as a straight substring - a typo (e.g. "Mizunar" for
  // "Mizunara") wouldn't, so try a fuzzy name match before giving up on
  // the local dataset and paying for a slower AI web search.
  const { data: fuzzyData, error: fuzzyError } = await supabase.rpc("search_restaurants_fuzzy", {
    search_name: query.trim(),
  });
  if (!fuzzyError && fuzzyData?.length) {
    return { results: fuzzyData.map(toLocalResult), fuzzy: true };
  }
  return { results: [], fuzzy: false };
}

async function handleLookup(supabase, query, city, userId) {
  // Google first: exact addresses, coordinates and a place ID in one fast
  // call, for any city. Its results are never cached (Google's terms), and
  // each one counts toward the hourly limit since it's a paid call. If
  // Google isn't configured, errors, or finds nothing, everything below
  // runs exactly as it did before.
  const google = await searchGooglePlaces(query, city, { onCall: () => logGoogleCall("search", userId) });
  if (google && google.length > 0) {
    return { result: { results: google, google: true }, cached: false };
  }

  const local = await searchLocalRestaurants(supabase, query, city);
  if (local.results.length > 0) {
    return { result: { results: local.results, fuzzy: local.fuzzy }, cached: true };
  }

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

  // The AI web search is the last resort. If it fails (an outage, a
  // decline, no API credit), answer "no matches" so the form simply asks
  // for the details by hand, rather than showing an error.
  let response;
  try {
    response = await anthropic.beta.messages.create({
      ...FALLBACK,
      model: LOOKUP_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      output_config: { effort: LOOKUP_EFFORT },
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
  } catch (err) {
    console.error("AI lookup failed", err?.message);
    return { result: { results: [] }, cached: true };
  }

  if (response.stop_reason === "refusal") {
    return { result: { results: [] }, cached: false };
  }
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
  const writer = serviceClient();
  if (results.length > 0 && writer) {
    await writer.from("place_lookup_cache").upsert(
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

  const response = await anthropic.beta.messages.create({
    ...FALLBACK,
    model: IMPORT_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    output_config: { effort: IMPORT_EFFORT, format: { type: "json_schema", schema } },
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

  if (response.stop_reason === "refusal") {
    throw new Error("The list couldn't be read. Try removing anything that isn't a restaurant.");
  }
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
