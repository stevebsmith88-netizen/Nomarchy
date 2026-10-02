import { describe, it, expect, afterEach } from "vitest";
import { safeMapsUrl } from "@/lib/safeUrl";
import { isCronAuthorized } from "@/lib/cronAuth";
import { shouldAutoStartTour, TOUR_LAUNCH } from "@/lib/tour";
import { normalizeA11y, isDefaultA11y } from "@/lib/a11yPrefs";
import { suggestCuisineName } from "@/lib/cuisineFromGoogle";
import { cleanRef } from "@/lib/signupSource";
import { CHANGELOG } from "@/lib/changelog";
import { getCuisineEmoji, setCuisineEmojis } from "@/app/cuisineIcons";

describe("safeMapsUrl", () => {
  it("allows Google Maps links only", () => {
    expect(safeMapsUrl("https://www.google.com/maps/place/?q=place_id:abc")).toBeTruthy();
    expect(safeMapsUrl("https://maps.app.goo.gl/xyz")).toBeTruthy();
    expect(safeMapsUrl("javascript:alert(1)")).toBe(null);
    expect(safeMapsUrl("https://evil.example/maps")).toBe(null);
    expect(safeMapsUrl("http://www.google.com/maps")).toBe(null);
  });
});

describe("isCronAuthorized", () => {
  const req = (h) => ({ headers: { get: (k) => (k === "authorization" ? h : null) } });
  afterEach(() => { delete process.env.CRON_SECRET; });
  it("refuses everything when no secret is configured", () => {
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(req("Bearer undefined"))).toBe(false);
  });
  it("accepts only the exact secret", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isCronAuthorized(req("Bearer s3cret"))).toBe(true);
    expect(isCronAuthorized(req("Bearer nope"))).toBe(false);
    expect(isCronAuthorized(req(null))).toBe(false);
  });
});

describe("first-time tour", () => {
  const base = { onboarded: true, databaseOk: true, seenAt: null, locallySeen: false, createdAt: "2099-01-01T00:00:00Z" };
  it("starts for a new account only", () => {
    expect(shouldAutoStartTour(base)).toBe(true);
    expect(shouldAutoStartTour({ ...base, createdAt: "2020-01-01T00:00:00Z" })).toBe(false);
    expect(shouldAutoStartTour({ ...base, createdAt: TOUR_LAUNCH })).toBe(false);
  });
  it("never repeats, and never runs before the username step or without the column", () => {
    expect(shouldAutoStartTour({ ...base, seenAt: "2099-01-02T00:00:00Z" })).toBe(false);
    expect(shouldAutoStartTour({ ...base, locallySeen: true })).toBe(false);
    expect(shouldAutoStartTour({ ...base, onboarded: false })).toBe(false);
    expect(shouldAutoStartTour({ ...base, databaseOk: false })).toBe(false);
  });
});

describe("accessibility choices", () => {
  it("fills in defaults and ignores junk", () => {
    expect(normalizeA11y({ motion: "sideways", largerText: "yes" })).toEqual({ motion: "system", calmCelebrations: false, largerText: false, stickyMessages: false });
    expect(isDefaultA11y({})).toBe(true);
    expect(isDefaultA11y({ largerText: true })).toBe(false);
  });
});

describe("cuisine helpers", () => {
  it("suggests a cuisine from Google's category, but not for a generic restaurant", () => {
    expect(suggestCuisineName("pizza_restaurant", [])).toBe("Pizza");
    expect(suggestCuisineName("restaurant", ["restaurant"])).toBe(null);
  });
  it("prefers a picked icon, then the built-in one, then the plate", () => {
    setCuisineEmojis({ Wings: "🍗", Pizza: "🧀" });
    expect(getCuisineEmoji("Wings")).toBe("🍗");
    expect(getCuisineEmoji("Pizza")).toBe("🧀");
    expect(getCuisineEmoji("Bar")).toBe("🍺");
    expect(getCuisineEmoji("Unknown")).toBe("🍽️");
    setCuisineEmojis({});
  });
});

describe("signup source tags", () => {
  it("keeps only short lowercase tags", () => {
    expect(cleanRef("IG_Bio")).toBe("ig_bio");
    expect(cleanRef("bad tag!")).toBe(null);
    expect(cleanRef("x".repeat(40))).toBe(null);
  });
});

describe("changelog", () => {
  it("is in date order with real dates, so the bell and email pick the right entries", () => {
    const times = CHANGELOG.map((c) => Date.parse(c.at));
    expect(times.every((t) => !Number.isNaN(t))).toBe(true);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(CHANGELOG.filter((c) => c.featured).length).toBeGreaterThanOrEqual(4);
  });
});
