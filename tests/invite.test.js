import { describe, it, expect, beforeEach } from "vitest";
import { cleanInvite, captureInviteFromUrl, getStoredInvite, claimInvite, inviteUrl } from "@/lib/invite";

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const visit = (search) => { globalThis.window = { location: { search } }; captureInviteFromUrl(); };

describe("invite links", () => {
  beforeEach(() => { globalThis.localStorage = fakeStorage(); });

  it("builds a personal link", () => {
    expect(inviteUrl("steve")).toBe("https://nomarchy.ca/steve?invite=steve");
  });

  it("accepts only real-looking usernames", () => {
    expect(cleanInvite(" Steve ")).toBe("steve");
    expect(cleanInvite("ab")).toBe(null);
    expect(cleanInvite("<script>")).toBe(null);
    expect(cleanInvite(null)).toBe(null);
  });

  it("keeps the most recent invite link opened", () => {
    visit("?invite=alex");
    visit("?ref=ig_story");
    expect(getStoredInvite()).toBe("alex");
    visit("?invite=steve");
    expect(getStoredInvite()).toBe("steve");
  });

  it("hands the invite to the database once, and returns the inviter's name", async () => {
    visit("?invite=steve");
    const calls = [];
    const supabase = { rpc: async (fn, args) => { calls.push([fn, args]); return { data: "Steve", error: null }; } };
    expect(await claimInvite(supabase, { user_metadata: {} })).toBe("Steve");
    expect(calls).toEqual([["claim_invite", { p_username: "steve" }]]);
    expect(getStoredInvite()).toBe(null);
    expect(await claimInvite(supabase, { user_metadata: {} })).toBe(null);
    expect(calls.length).toBe(1);
  });

  it("falls back to the invite saved with the sign-up, and keeps it if the call fails", async () => {
    const failing = { rpc: async () => ({ data: null, error: { message: "offline" } }) };
    visit("?invite=steve");
    expect(await claimInvite(failing, { user_metadata: {} })).toBe(null);
    expect(getStoredInvite()).toBe("steve");
    globalThis.localStorage = fakeStorage();
    const ok = { rpc: async (fn, args) => ({ data: args.p_username === "alex" ? "Alex" : null, error: null }) };
    expect(await claimInvite(ok, { user_metadata: { signup_invite: "alex" } })).toBe("Alex");
  });
});
