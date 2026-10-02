import { describe, it, expect, vi, beforeEach } from "vitest";

// Every Supabase client the routes create comes from here.
const state = vi.hoisted(() => ({ log: [], files: {}, owner: true }));
vi.mock("@supabase/supabase-js", () => {
  const chain = (table, op) => {
    const args = [];
    const api = new Proxy({}, {
      get(_, k) {
        if (k === "then") return (res) => { state.log.push([op, table, JSON.stringify(args)]); return Promise.resolve({ data: op === "select" ? [{ place_name: "Shut" }] : null, error: null }).then(res); };
        if (k === "single") return () => Promise.resolve({ data: { is_owner: state.owner }, error: null });
        return (...a) => { args.push([k, ...a]); return api; };
      },
    });
    return api;
  };
  return {
    createClient: () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: "U1" } } }),
        getUserIdentities: async () => ({ data: { identities: [{ provider: "email" }] } }),
        unlinkIdentity: async () => ({}),
        admin: {
          deleteUser: async (id) => { state.log.push(["deleteUser", id]); return { error: null }; },
          updateUserById: async (id, v) => { state.log.push(["updateUser", id, v.email]); return { error: null }; },
        },
      },
      from: (t) => ({ select: () => chain(t, "select"), delete: () => chain(t, "delete"), update: (v) => { state.log.push(["set", t, JSON.stringify(v)]); return chain(t, "update"); }, upsert: (v) => { state.log.push(["upsert", t, JSON.stringify(v)]); return Promise.resolve({ error: null }); } }),
      storage: { from: (b) => ({ list: async () => ({ data: (state.files[b] || []).map((n) => ({ name: n })), error: null }), remove: async (paths) => { state.log.push(["remove", b, paths.join(",")]); state.files[b] = []; return { error: null }; } }) },
    }),
  };
});

const post = (handler, body, auth = "Bearer tok") =>
  handler(new Request("http://x", { method: "POST", headers: auth ? { authorization: auth } : {}, body: JSON.stringify(body) }));

beforeEach(() => { state.log.length = 0; state.files = { avatars: ["a.png"], "review-photos": ["p.jpg"] }; state.owner = true; });

describe("delete account", () => {
  it("full erase removes files first, then the sign-in", async () => {
    const { POST } = await import("@/app/api/delete-account/route");
    const res = await post(POST, { eraseContent: true });
    expect(await res.json()).toEqual({ deleted: true, erased: true });
    const ops = state.log.map((l) => l.join(" "));
    expect(ops.indexOf("remove review-photos U1/p.jpg")).toBeLessThan(ops.indexOf("deleteUser U1"));
    expect(ops).toContain("remove avatars U1/a.png");
  });
  it("keep-my-crowns anonymises instead, and is the default for anything unexpected", async () => {
    const { POST } = await import("@/app/api/delete-account/route");
    const res = await post(POST, { eraseContent: "yes" });
    expect(await res.json()).toEqual({ deleted: true, erased: false });
    const ops = state.log.map((l) => l.join(" "));
    expect(ops).not.toContain("deleteUser U1");
    expect(ops.some((o) => o.startsWith("set profiles") && o.includes("No longer a user") && o.includes("former-member-"))).toBe(true);
    expect(ops.some((o) => o.startsWith("updateUser U1 deleted-U1@deleted.invalid"))).toBe(true);
  });
  it("refuses without a sign-in", async () => {
    const { POST } = await import("@/app/api/delete-account/route");
    expect((await post(POST, {}, null)).status).toBe(401);
  });
});

describe("mark a place closed", () => {
  it("is owner-only and validates its input", async () => {
    const { POST } = await import("@/app/api/admin/closed-places/route");
    expect((await post(POST, { action: "nuke", placeId: "PLACE_x_000001" })).status).toBe(400);
    expect((await post(POST, { action: "mark", placeId: "bad id" })).status).toBe(400);
    state.owner = false;
    expect((await post(POST, { action: "mark", placeId: "PLACE_x_000001" })).status).toBe(403);
  });
});

describe("scheduled jobs", () => {
  it("refuse to run without the cron secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    for (const path of ["@/app/api/refresh-coords/route", "@/app/api/reengage/send/route"]) {
      const { GET } = await import(path);
      expect((await GET(new Request("http://x", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401);
    }
    delete process.env.CRON_SECRET;
  });
});
