import { describe, it, expect } from "vitest";
import { refreshCoords } from "@/lib/coordRefresh";
import { checkClosures } from "@/lib/closureCheck";
import { fakeDb } from "./fakeDb";

const DAY = 86400000;
const NOW = Date.parse("2026-11-01T06:00:00Z");
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const crown = (id, name, daysAgo) => ({ google_place_id: id, place_name: name, coords_refreshed_at: daysAgo === null ? null : ago(daysAgo), lat: 1, lng: 1, decree: "keep" });

function fakeGoogle(behaviour, calls) {
  return async (url, opts) => {
    const id = decodeURIComponent(url.split("/places/")[1]);
    calls.push({ id, mask: opts.headers["X-Goog-FieldMask"] });
    const b = behaviour[id];
    if (b === "gone") return { ok: false, status: 404, json: async () => ({}) };
    if (b === "fail") return { ok: false, status: 503, json: async () => ({}) };
    if (b === "closed") return { ok: true, status: 200, json: async () => ({ businessStatus: "CLOSED_PERMANENTLY" }) };
    return { ok: true, status: 200, json: async () => ({ location: { latitude: 43.7, longitude: -79.4 }, businessStatus: "OPERATIONAL" }) };
  };
}

describe("daily coordinate refresh", () => {
  it("refreshes only what's due, once per place, and never touches anything else", async () => {
    const db = fakeDb({
      thrones: [crown("PLACE_fresh_00001", "Fresh", 3), crown("PLACE_old_000002", "Old", 25), crown("PLACE_gone_00003", "Gone", 40), crown("PLACE_closed_0004", "Closed", 40)],
      next_in_line: [crown("PLACE_old_000002", "Old", 25)],
      place_refresh_issues: [],
      closed_places: [{ google_place_id: "PLACE_closed_0004" }],
    });
    const calls = [];
    const summary = await refreshCoords(db, { apiKey: "K", now: () => NOW, fetchImpl: fakeGoogle({ PLACE_gone_00003: "gone" }, calls) });
    expect(calls.map((c) => c.id).sort()).toEqual(["PLACE_gone_00003", "PLACE_old_000002"]);
    expect(calls.every((c) => c.mask === "location")).toBe(true);
    expect(summary).toMatchObject({ refreshed: 1, gone: 1 });
    expect(db.tables.next_in_line[0].lat).toBe(43.7);
    expect(db.tables.thrones.find((r) => r.place_name === "Old").decree).toBe("keep");
    expect(db.tables.place_refresh_issues.map((r) => r.place_name)).toEqual(["Gone"]);
  });
});

describe("closure check", () => {
  it("reports permanently closed and missing places, counting crowns and lists", async () => {
    const db = fakeDb({
      thrones: [{ google_place_id: "PLACE_open_00001", place_name: "Open", address: "" }, { google_place_id: "PLACE_closed_0002", place_name: "Shut", address: "2 B St" }],
      next_in_line: [{ google_place_id: "PLACE_closed_0002", place_name: "Shut", address: "2 B St" }],
    });
    const calls = [];
    const r = await checkClosures(db, 0, { apiKey: "K", fetchImpl: fakeGoogle({ PLACE_closed_0002: "closed" }, calls) });
    expect(r.closed).toEqual([{ placeId: "PLACE_closed_0002", name: "Shut", address: "2 B St", crowns: 1, lists: 1 }]);
    expect(calls.every((c) => c.mask === "businessStatus")).toBe(true);
  });
});

import { cleanUpOldRecords } from "@/lib/maintenance";

describe("daily clean-up", () => {
  it("removes only old log rows", async () => {
    const db = fakeDb({
      ai_calls: [{ called_at: ago(40) }, { called_at: ago(1) }],
      dismissed_notifications: [{ dismissed_at: ago(31) }, { dismissed_at: ago(2) }],
      place_lookup_cache: [{ created_at: ago(100) }, { created_at: ago(10) }],
    });
    const result = await cleanUpOldRecords(db, { now: () => NOW });
    expect(result).toEqual({ ai_calls: "ok", dismissed_notifications: "ok", place_lookup_cache: "ok" });
    expect(db.tables.ai_calls).toHaveLength(1);
    expect(db.tables.dismissed_notifications).toHaveLength(1);
    expect(db.tables.place_lookup_cache).toHaveLength(1);
  });
});
