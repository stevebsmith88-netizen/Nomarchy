import { describe, it, expect, beforeEach } from "vitest";
import { loadDraft, saveDraft, clearDraft, clearAllDrafts, DRAFT_MAX_AGE_MS } from "@/lib/decreeDrafts";

// A minimal in-memory localStorage (tests run in Node, which has none).
function fakeStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe("decree drafts", () => {
  beforeEach(() => { globalThis.localStorage = fakeStorage(); });

  it("saves and restores a draft per account and spot", () => {
    saveDraft("u1", "crown:c1", { text: "Best pizza in town" });
    expect(loadDraft("u1", "crown:c1")).toEqual({ text: "Best pizza in town" });
    expect(loadDraft("u1", "crown:c2")).toBe(null);
    expect(loadDraft("u2", "crown:c1")).toBe(null);
  });

  it("drops a draft once the decree is emptied or cleared", () => {
    saveDraft("u1", "crown:c1", { text: "Something" });
    saveDraft("u1", "crown:c1", { text: "   " });
    expect(loadDraft("u1", "crown:c1")).toBe(null);
    saveDraft("u1", "crown:c1", { text: "Again" });
    clearDraft("u1", "crown:c1");
    expect(loadDraft("u1", "crown:c1")).toBe(null);
    expect(localStorage.length).toBe(0);
  });

  it("forgets drafts older than a week", () => {
    saveDraft("u1", "crown:c1", { text: "Old" }, 1000);
    expect(loadDraft("u1", "crown:c1", 1000 + DRAFT_MAX_AGE_MS - 1)).toEqual({ text: "Old" });
    expect(loadDraft("u1", "crown:c1", 1000 + DRAFT_MAX_AGE_MS + 1)).toBe(null);
  });

  it("wipes every account's drafts on sign-out, and nothing else", () => {
    localStorage.setItem("nomarchy-theme", "dark");
    saveDraft("u1", "crown:c1", { text: "One" });
    saveDraft("u2", "coup:c2", { text: "Two" });
    clearAllDrafts();
    expect(loadDraft("u1", "crown:c1")).toBe(null);
    expect(loadDraft("u2", "coup:c2")).toBe(null);
    expect(localStorage.getItem("nomarchy-theme")).toBe("dark");
  });

  it("never throws when storage is unavailable or corrupt", () => {
    globalThis.localStorage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() {}, key: () => null, length: 0 };
    expect(() => saveDraft("u1", "crown:c1", { text: "x" })).not.toThrow();
    expect(loadDraft("u1", "crown:c1")).toBe(null);
    globalThis.localStorage = fakeStorage();
    localStorage.setItem("nomarchy-drafts:u1", "{not json");
    expect(loadDraft("u1", "crown:c1")).toBe(null);
  });
});
