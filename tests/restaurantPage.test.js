import { describe, it, expect } from "vitest";
import { bestRankLabel, crownedCuisines, googleMapsUrl, kingdomPath, restaurantPreview, restaurantUrl } from "@/lib/restaurantPage";

const page = {
  slug: "pizzeria-libretto-toronto", google_place_id: "GID1", name: "Pizzeria Libretto", neighbourhood: "Ossington", city: "Toronto",
  address: "221 Ossington Ave", closed: false, crown_count: 3, best_rank: 2,
  crowns: [{ cuisine: "Overall Favourite", cuisine_id: "c0" }, { cuisine: "Pizza", cuisine_id: "c1" }, { cuisine: "Pizza", cuisine_id: "c1" }],
};

describe("restaurant pages", () => {
  it("builds its own address and a Google Maps link to the exact place", () => {
    expect(restaurantUrl("pizzeria-libretto-toronto")).toBe("https://nomarchy.ca/r/pizzeria-libretto-toronto");
    const url = googleMapsUrl(page);
    expect(url).toContain("query_place_id=GID1");
    expect(url).toContain("Pizzeria%20Libretto");
  });

  it("lists the real cuisine first and Overall Favourite last", () => {
    expect(crownedCuisines(page.crowns).map((c) => c.name)).toEqual(["Pizza", "Overall Favourite"]);
  });

  it("describes the Best in the Land rank", () => {
    expect(bestRankLabel(page)).toBe("#2 in Best in the Land in Toronto");
    expect(bestRankLabel({ ...page, city: null })).toBe("#2 in Best in the Land");
    expect(bestRankLabel({ ...page, best_rank: null })).toBe(null);
  });

  it("never links to a deleted account's kingdom", () => {
    expect(kingdomPath("steve")).toBe("/steve");
    expect(kingdomPath("former-member-ab12c")).toBe(null);
  });

  it("previews with the Nomarchy logo, and keeps uncrowned pages out of search", () => {
    const m = restaurantPreview(page);
    expect(m.title).toBe("Pizzeria Libretto (Ossington, Toronto)");
    expect(m.description).toContain("Crowned 3 times");
    expect(m.robots.index).toBe(true);
    expect(m.openGraph.images[0].url).toBe("/icon-512.png");
    expect(restaurantPreview({ ...page, crown_count: 0 }).robots.index).toBe(false);
    expect(restaurantPreview({ ...page, closed: true }).description).toContain("permanently closed");
  });
});
