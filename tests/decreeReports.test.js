import { describe, it, expect, vi, beforeEach } from "vitest";
import { fakeDb } from "./fakeDb";
import { formatDecreeReport, parseDecreeReport, reviewPhotoPath, REMOVED_DECREE_NOTICE } from "@/lib/decreeReports";

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const U = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let db, removed;
vi.mock("@/lib/requireOwner", () => ({ requireOwner: async () => ({ admin: Object.assign(db, { storage: { from: () => ({ remove: async (paths) => { removed.push(...paths); return {}; } }) } }) }) }));
vi.mock("../../../../lib/requireOwner", () => ({ requireOwner: async () => ({ admin: Object.assign(db, { storage: { from: () => ({ remove: async (paths) => { removed.push(...paths); return {}; } }) } }) }) }));

describe("decree reports", () => {
  it("round-trips the decree id and page through a report message", () => {
    const msg = formatDecreeReport({ slug: "pai-toronto", username: "alex", throneId: T, reason: "  rude  " });
    expect(msg).toContain("@alex");
    expect(msg).toContain("rude");
    expect(parseDecreeReport(msg)).toEqual({ throneId: T, slug: "pai-toronto" });
    expect(parseDecreeReport("just some feedback")).toBe(null);
    expect(formatDecreeReport({ slug: "x", throneId: T })).toContain("(no reason given)");
  });
  it("only deletes photos from the author's own folder", () => {
    const url = (p) => `https://x.supabase.co/storage/v1/object/public/review-photos/${p}`;
    expect(reviewPhotoPath(url(`${U}/a.jpg`), U)).toBe(`${U}/a.jpg`);
    expect(reviewPhotoPath(url("someone-else/a.jpg"), U)).toBe(null);
    expect(reviewPhotoPath("not a url", U)).toBe(null);
  });
  it("the removal notice is long enough for the database's decree rule", () => {
    expect(REMOVED_DECREE_NOTICE.trim().length).toBeGreaterThanOrEqual(30);
  });
});

describe("remove a decree", () => {
  beforeEach(() => {
    removed = [];
    db = fakeDb({
      thrones: [{ id: T, user_id: U, place_name: "PAI", cuisine_id: "c1", decree: "something awful that is long enough", photos: [`https://x.supabase.co/storage/v1/object/public/review-photos/${U}/a.jpg`] }],
      content_removals: [],
    });
  });
  const post = async (body) => {
    const { POST } = await import("@/app/api/admin/remove-decree/route");
    return POST(new Request("http://x", { method: "POST", headers: { authorization: "Bearer t" }, body: JSON.stringify(body) }));
  };
  it("keeps the original, replaces the decree, clears photos and files, and leaves the crown", async () => {
    expect(await (await post({ throneId: T })).json()).toEqual({ removed: true });
    expect(db.tables.thrones[0]).toMatchObject({ decree: REMOVED_DECREE_NOTICE, photos: [], cuisine_id: "c1", place_name: "PAI" });
    expect(db.tables.content_removals[0]).toMatchObject({ user_id: U, place_name: "PAI", original_decree: "something awful that is long enough" });
    expect(db.tables.content_removals[0].original_photos).toHaveLength(1);
    expect(removed).toEqual([`${U}/a.jpg`]);
  });
  it("does nothing twice, and rejects bad input or a missing decree", async () => {
    await post({ throneId: T });
    expect(await (await post({ throneId: T })).json()).toEqual({ removed: true, already: true });
    expect(db.tables.content_removals).toHaveLength(1);
    expect((await post({ throneId: "nope" })).status).toBe(400);
    expect((await post({ throneId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" })).status).toBe(404);
  });
});
