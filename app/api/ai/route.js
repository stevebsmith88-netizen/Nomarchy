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

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in AI response");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function POST(request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
  }

  const supabase = supabaseForToken(token);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

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
    return NextResponse.json(
      { error: "Hourly limit reached. Try again later." },
      { status: 429 }
    );
  }

  const body = await request.json();
  const { mode } = body;

  try {
    if (mode === "lookup") {
      const result = await handleLookup(body);
      await supabase.from("ai_calls").insert({ user_id: user.id });
      return NextResponse.json(result);
    }

    if (mode === "import") {
      const result = await handleImport(body);
      await supabase.from("ai_calls").insert({ user_id: user.id });
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err.message ?? "AI request failed" },
      { status: 502 }
    );
  }
}

async function handleLookup({ query, city }) {
  const place = [query, city].filter(Boolean).join(" near ");

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    messages: [
      {
        role: "user",
        content:
          `Find up to 5 real, currently-operating restaurants matching "${place}". ` +
          `Use web search to confirm they exist and get accurate details. ` +
          `Respond with ONLY a single JSON object (no prose, no markdown fences) of this exact shape: ` +
          `{"results": [{"name": string, "address": string, "neighborhood": string, "cuisine": string, "notes": string}]}. ` +
          `If you find nothing, respond with {"results": []}.`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const parsed = extractJson(textBlock?.text ?? "");
  return { results: Array.isArray(parsed.results) ? parsed.results.slice(0, 5) : [] };
}

async function handleImport({ text, cuisines }) {
  const trimmedText = (text ?? "").slice(0, MAX_IMPORT_CHARS);
  const cuisineList = Array.isArray(cuisines) ? cuisines : [];

  const schema = {
    type: "object",
    properties: {
      entries: {
        type: "array",
        items: {
          type: "object",
          properties: {
            cuisineName: { type: "string" },
            matchedCuisineId: { anyOf: [{ type: "string" }, { type: "null" }] },
            restaurantName: { type: "string" },
            address: { anyOf: [{ type: "string" }, { type: "null" }] },
            note: { anyOf: [{ type: "string" }, { type: "null" }] },
          },
          required: ["cuisineName", "matchedCuisineId", "restaurantName", "address", "note"],
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
          `Parse this free-text list of restaurants into structured entries. For each restaurant, ` +
          `infer its cuisine and the restaurant name, and an address if one is given. ` +
          `Here are the user's existing cuisines, as {id, name}: ${JSON.stringify(cuisineList)}. ` +
          `If a restaurant's cuisine matches one of these by name (case-insensitive), set matchedCuisineId ` +
          `to that cuisine's id; otherwise set matchedCuisineId to null and still fill in cuisineName ` +
          `with your best guess so the user can create a new cuisine for it.\n\n` +
          `Text:\n${trimmedText}`,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const parsed = JSON.parse(textBlock?.text ?? "{}");
  return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
}
