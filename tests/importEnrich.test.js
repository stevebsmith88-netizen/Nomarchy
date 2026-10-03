import { describe, it, expect } from "vitest";
import { enrichRows, pickMatch, MAX_ENRICH } from "@/lib/importEnrich";

const g = (id, name, extra = {}) => ({ googlePlaceId: id, name, address: "1 King St W, Toronto", neighbourhood: "Downtown", lat: 43.6, lng: -79.4, mapsUrl: "https://maps/x", primaryType: "", types: [], ...extra });

describe("import enrichment", () => {
  it("accepts an exact name, and a partial name only when Google ranks it first", () => {
    expect(pickMatch({ name: "Pai" }, [g("a", "Pai")]).googlePlaceId).toBe("a");
    expect(pickMatch({ name: "The Rex" }, [g("a", "Elsewhere"), g("b", "Rex")]).googlePlaceId).toBe("b");
    expect(pickMatch({ name: "Florette" }, [g("a", "Florette Bakery")]).googlePlaceId).toBe("a");
    expect(pickMatch({ name: "Florette" }, [g("a", "Other Place"), g("b", "Florette Bakery")])).toBe(null);
    // Very short names are too easy to match by accident.
    expect(pickMatch({ name: "Pai" }, [g("a", "Pai Northern Thai Kitchen")])).toBe(null);
    expect(pickMatch({ name: "Pai" }, [g("a", "Totally Different")])).toBe(null);
  });
  it("never matches a closed place", () => {
    expect(pickMatch({ name: "Pai" }, [g("a", "Pai")], new Set(["a"]))).toBe(null);
  });
  it("returns details and a cuisine suggestion in order, leaving unclear rows empty", async () => {
    const search = async (q) => (q.startsWith("Pai") ? [g("a", "Pai", { primaryType: "thai_restaurant" })] : q.startsWith("Boom") ? [] : [g("c", "Nothing Like It")]);
    const out = await enrichRows([{ name: "Pai", area: "Entertainment District" }, { name: "Boom" }, { name: "Mystery" }], "Toronto", { search });
    expect(out[0]).toMatchObject({ googlePlaceId: "a", suggestedCuisine: "Thai", address: "1 King St W, Toronto", lat: 43.6 });
    expect(out[1]).toBe(null);
    expect(out[2]).toBe(null);
  });
  it("survives a failing search and caps the number checked", async () => {
    const rows = Array.from({ length: MAX_ENRICH + 5 }, (_, i) => ({ name: `Place ${i}` }));
    let calls = 0;
    const out = await enrichRows(rows, "Toronto", { search: async () => { calls++; throw new Error("down"); } });
    expect(out.every((x) => x === null)).toBe(true);
    expect(calls).toBe(MAX_ENRICH);
  });
});
