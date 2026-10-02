import { describe, it, expect } from "vitest";
import { placeKey, groupCrownedThrones } from "@/lib/data";
import { decide, groupKey, nameMatch } from "@/lib/placeMatch";

const row = (user, name, address, gid, area = null) => ({ user_id: user, place_name: name, address, neighbourhood: area, google_place_id: gid, rating: null, maps_url: null });

describe("placeKey", () => {
  it("treats Street/St, postal codes and the city as the same address", () => {
    expect(placeKey("Lady Marmalade", "898 Queen St E", null)).toBe(placeKey("Lady Marmalade", "898 Queen Street East, Toronto, ON M4M 3B7", null));
  });
  it("falls back to the neighbourhood when there is no address", () => {
    expect(placeKey("Pho House", null, "Chinatown")).toBe("pho house|chinatown");
  });
});

describe("groupCrownedThrones (Best in the Land)", () => {
  it("counts one real place typed three ways as one line", () => {
    const g = groupCrownedThrones([
      row("u1", "Pizzeria Libretto", "221 Ossington Ave", "GID_LIB"),
      row("u2", "Libretto Pizzeria", "221 Ossington Avenue", "GID_LIB"),
      row("u3", "pizzeria libretto - ossington", null, "GID_LIB", "Ossington"),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].count).toBe(3);
  });
  it("keeps two different Google places with the same name apart", () => {
    expect(groupCrownedThrones([row("u1", "Pho House", null, "A"), row("u2", "Pho House", null, "B")])).toHaveLength(2);
  });
  it("joins a crown with no Google ID to the matching place", () => {
    const g = groupCrownedThrones([row("u1", "Florette", "1 King St W", "F"), row("u2", "Florette", "1 King Street West", null)]);
    expect(g).toHaveLength(1);
    expect(g[0].count).toBe(2);
  });
  it("counts a person once even if they crowned the place twice", () => {
    expect(groupCrownedThrones([row("u1", "X", "1 A St", "X1"), row("u1", "X", "1 A St", "X1")])[0].count).toBe(1);
  });
});

describe("Google backfill matching", () => {
  it("auto-matches only an exact name with location evidence", () => {
    const ours = { name: "Florette", address: "1 King St W", lat: 43.649, lng: -79.379 };
    expect(decide(ours, [{ googlePlaceId: "g1", name: "Florette", address: "1 King Street West, Toronto", lat: 43.6491, lng: -79.3791 }]).status).toBe("auto");
    expect(decide(ours, [{ googlePlaceId: "g2", name: "Florette Bakery", address: "99 Elsewhere", lat: 44, lng: -80 }]).status).toBe("review");
    expect(decide(ours, []).status).toBe("none");
  });
  it("groups the same place regardless of street spelling", () => {
    expect(groupKey({ name: "The Rex", address: "194 Queen St W", city: "Toronto" })).toBe(groupKey({ name: "Rex", address: "194 Queen Street West", city: "toronto" }));
  });
  it("only calls long contained names a partial match", () => {
    expect(nameMatch("Pai", "Pai Northern Thai Kitchen")).toBe(null);
    expect(nameMatch("Burger Crush", "Burger Crush Toronto")).toBe("partial");
  });
});
