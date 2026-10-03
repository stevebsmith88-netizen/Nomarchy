import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "./fakeDb";
import { decide } from "@/lib/placeMatch";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const N1 = "33333333-3333-4333-8333-333333333333";
const N2 = "44444444-4444-4444-8444-444444444444";
const N3 = "55555555-5555-4555-8555-555555555555";
let db;
vi.mock("@/lib/requireOwner", () => ({ requireOwner: async () => ({ admin: db }) }));
vi.mock("../../../../lib/requireOwner", () => ({ requireOwner: async () => ({ admin: db }) }));

const g = (id, name, extra = {}) => ({ googlePlaceId: id, name, address: "18 Duncan St, Toronto", neighbourhood: "Entertainment District", lat: 43.64, lng: -79.39, mapsUrl: "https://maps.google.com/?cid=9", primaryType: "thai_restaurant", types: [], ...extra });

describe("backfill matching for places known only by name", () => {
  it("accepts an exact name, with honest evidence, when there's no address or pin", () => {
    const v = decide({ name: "Pai", address: null, lat: null, lng: null }, [g("a", "Pai")]);
    expect(v.status).toBe("auto");
    expect(v.evidence).toContain("no saved address");
  });
  it("still needs the location to agree when there is one", () => {
    expect(decide({ name: "Pai", address: "1 Elsewhere Rd", lat: 44, lng: -80 }, [g("a", "Pai")]).status).toBe("review");
  });
  it("sends a different name to review, not auto", () => {
    expect(decide({ name: "Pai", address: null }, [g("a", "Something Else")]).status).toBe("review");
  });
});

describe("backfill apply", () => {
  beforeEach(() => {
    db = fakeDb({
      cuisines: [{ id: "c-thai", name: "Thai", is_default: true }, { id: "c-mine", name: "Thai", is_default: false }],
      thrones: [{ id: T1, google_place_id: null, address: null, neighbourhood: "Mine", place_name: "PAI" }, { id: T2, google_place_id: "EXISTING1234", address: null, place_name: "OTHER" }],
      next_in_line: [
        { id: N1, google_place_id: null, address: null, neighbourhood: null, city: null, maps_url: null, cuisine_id: null, place_name: "PAI" },
        { id: N2, google_place_id: null, address: "My own address", neighbourhood: "Annex", city: "Toronto", maps_url: null, cuisine_id: "c-chosen", place_name: "PAI" },
        { id: N3, google_place_id: "EXISTING1234", address: null, cuisine_id: null, place_name: "KEEP" },
      ],
    });
  });
  const update = { thrones: [T1, T2], nextInLine: [N1, N2, N3], googlePlaceId: "GIDPAI12345", lat: 43.64, lng: -79.39, address: "18 Duncan St, Toronto", neighbourhood: "Entertainment District", city: "Toronto", mapsUrl: "https://maps.google.com/?cid=9", cuisine: "Thai" };
  const post = async (body) => {
    const { POST } = await import("@/app/api/admin/backfill-places/route");
    process.env.GOOGLE_PLACES_API_KEY = "test";
    return POST(new Request("http://x", { method: "POST", headers: { authorization: "Bearer t" }, body: JSON.stringify(body) }));
  };
  const row = (table, id) => db.tables[table].find((r) => r.id === id);

  it("sets the Google ID and fills only blank fields, including a shared cuisine", async () => {
    const res = await post({ mode: "apply", updates: [update] });
    expect((await res.json()).saved).toBe(3);
    expect(row("next_in_line", N1)).toMatchObject({ google_place_id: "GIDPAI12345", address: "18 Duncan St, Toronto", neighbourhood: "Entertainment District", city: "Toronto", cuisine_id: "c-thai", lat: 43.64 });
    // Someone's own entries are never overwritten.
    expect(row("next_in_line", N2)).toMatchObject({ google_place_id: "GIDPAI12345", address: "My own address", neighbourhood: "Annex", cuisine_id: "c-chosen", maps_url: "https://maps.google.com/?cid=9" });
    expect(row("thrones", T1)).toMatchObject({ google_place_id: "GIDPAI12345", neighbourhood: "Mine", address: "18 Duncan St, Toronto" });
    expect(row("thrones", T1)).not.toHaveProperty("cuisine_id");
  });
  it("never touches a row that already has a Google ID", async () => {
    await post({ mode: "apply", updates: [update] });
    expect(row("thrones", T2)).toEqual({ id: T2, google_place_id: "EXISTING1234", address: null, place_name: "OTHER" });
    expect(row("next_in_line", N3)).toEqual({ id: N3, google_place_id: "EXISTING1234", address: null, cuisine_id: null, place_name: "KEEP" });
  });
  it("rejects a non-Google map link and over-long text", async () => {
    expect((await post({ mode: "apply", updates: [{ ...update, mapsUrl: "https://evil.example/x" }] })).status).toBe(400);
    expect((await post({ mode: "apply", updates: [{ ...update, address: "x".repeat(301) }] })).status).toBe(400);
    expect(row("next_in_line", N1).google_place_id).toBe(null);
  });
  it("ignores a cuisine that isn't one of the shared ones", async () => {
    await post({ mode: "apply", updates: [{ ...update, cuisine: "Made Up" }] });
    expect(row("next_in_line", N1).cuisine_id).toBe(null);
    expect(row("next_in_line", N1).google_place_id).toBe("GIDPAI12345");
  });
});

import { planFill } from "@/lib/placeDetails";
import { fetchPlaceDetails } from "@/lib/googlePlaces";

describe("filling details on places that already have a Google ID", () => {
  const place = { name: "And/Ore", address: "18 Duncan St, Toronto", neighbourhood: "Old Toronto", city: "Toronto", mapsUrl: "https://maps.google.com/?cid=1", primaryType: "canadian_restaurant", types: [] };
  it("plans only what's blank, counting rows, and notes when no cuisine can be suggested", () => {
    const rows = [
      { table: "next_in_line", address: "", neighbourhood: null, city: "Toronto", maps_url: null, cuisine_id: "c1" },
      { table: "next_in_line", address: "x", neighbourhood: "Annex", city: "Toronto", maps_url: "https://maps.google.com/?cid=2", cuisine_id: null },
    ];
    const plan = planFill(rows, place);
    expect(plan.counts).toEqual({ address: 1, neighbourhood: 1, city: 0, mapsUrl: 1, cuisine: 0 });
    expect(plan.noCuisineSuggestion).toBe(1);
    expect(planFill([{ table: "thrones", address: "a", neighbourhood: "n", city: "c", maps_url: "https://maps.google.com/?cid=3" }], place)).toBe(null);
  });
  it("suggests a cuisine only for Next in Line entries", () => {
    const thai = { ...place, primaryType: "thai_restaurant" };
    expect(planFill([{ table: "next_in_line", cuisine_id: null, address: "a", neighbourhood: "n", city: "c", maps_url: "https://maps.google.com/?cid=3" }], thai).counts.cuisine).toBe(1);
    expect(planFill([{ table: "thrones", cuisine_id: null, address: "a", neighbourhood: "n", city: "c", maps_url: "https://maps.google.com/?cid=3" }], thai)).toBe(null);
  });
  it("looks a place up by ID and reports ok, gone or error", async () => {
    const json = { id: "GIDX123456789", displayName: { text: "And/Ore" }, formattedAddress: "18 Duncan St, Toronto", location: { latitude: 43.6, longitude: -79.4 }, addressComponents: [{ types: ["locality"], longText: "Toronto" }, { types: ["sublocality_level_1"], longText: "Old Toronto" }] };
    const ok = await fetchPlaceDetails("GIDX123456789", { apiKey: "k", fetchImpl: async () => ({ ok: true, status: 200, json: async () => json }) });
    expect(ok.status).toBe("ok");
    expect(ok.place).toMatchObject({ city: "Toronto", neighbourhood: "Old Toronto" });
    expect((await fetchPlaceDetails("GIDX123456789", { apiKey: "k", fetchImpl: async () => ({ ok: false, status: 404 }) })).status).toBe("gone");
    expect((await fetchPlaceDetails("GIDX123456789", { apiKey: "k", fetchImpl: async () => { throw new Error("down"); } })).status).toBe("error");
    expect((await fetchPlaceDetails("bad id!", { apiKey: "k" })).status).toBe("error");
  });
});

describe("details-apply", () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  let db2;
  vi.mock("@/lib/requireOwner", () => ({ requireOwner: async () => ({ admin: globalThis.__db2 || db }) }));
  const post2 = async (body) => {
    globalThis.__db2 = db2;
    const { POST } = await import("@/app/api/admin/backfill-places/route");
    process.env.GOOGLE_PLACES_API_KEY = "test";
    return POST(new Request("http://x", { method: "POST", headers: { authorization: "Bearer t" }, body: JSON.stringify(body) }));
  };
  beforeEach(() => {
    db2 = fakeDb({
      cuisines: [{ id: "c-thai", name: "Thai", is_default: true }],
      next_in_line: [
        { id: A, google_place_id: "GIDPAI12345", address: null, neighbourhood: null, city: null, maps_url: null, cuisine_id: null, place_name: "PAI", note: "keep me" },
        { id: B, google_place_id: "GIDPAI12345", address: "mine", neighbourhood: "Annex", city: "Toronto", maps_url: null, cuisine_id: "c-custom", place_name: "PAI" },
        { id: C, google_place_id: "OTHERPLACE99", address: null, neighbourhood: null, city: null, maps_url: null, cuisine_id: null, place_name: "NOT PAI" },
      ],
      thrones: [],
    });
  });
  const u = { thrones: [], nextInLine: [A, B, C], googlePlaceId: "GIDPAI12345", address: "18 Duncan St, Toronto", neighbourhood: "Entertainment District", city: "Toronto", mapsUrl: "https://maps.google.com/?cid=9", cuisine: "Thai" };
  it("fills only blanks on that place's own rows, never changes the Google ID, and can't reach another place's rows", async () => {
    const res = await (await post2({ mode: "details-apply", updates: [u] })).json();
    expect(res).toMatchObject({ rows: 2 });
    const get = (id) => db2.tables.next_in_line.find((r) => r.id === id);
    expect(get(A)).toMatchObject({ address: "18 Duncan St, Toronto", neighbourhood: "Entertainment District", city: "Toronto", maps_url: "https://maps.google.com/?cid=9", cuisine_id: "c-thai", google_place_id: "GIDPAI12345", note: "keep me" });
    expect(get(B)).toMatchObject({ address: "mine", neighbourhood: "Annex", cuisine_id: "c-custom", maps_url: "https://maps.google.com/?cid=9" });
    expect(get(C)).toMatchObject({ address: null, neighbourhood: null, cuisine_id: null, google_place_id: "OTHERPLACE99" });
  });
  it("rejects bad input", async () => {
    expect((await post2({ mode: "details-apply", updates: [{ ...u, mapsUrl: "https://evil.example" }] })).status).toBe(400);
  });
});
