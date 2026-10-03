// Signed-in smoke test: runs the real app in a browser with a fake Supabase
// (no network), clicks through every tab and the main pop-ups, and fails on
// any page error. Run against a production build:
//   NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build
//   npx next start -p 3150 &  node tests/e2e/smoke.cjs http://localhost:3150
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const BASE = process.argv[2] || "http://localhost:3150";
const UID = "11111111-1111-1111-1111-111111111111";
const now = new Date().toISOString();
const user = { id: UID, aud: "authenticated", role: "authenticated", email: "steve@example.com", app_metadata: { provider: "email" }, user_metadata: {}, identities: [], created_at: "2026-01-01T00:00:00Z" };
const profile = { id: UID, username: "steve", display_name: "Steve", city: "Toronto", created_at: "2026-01-01T00:00:00Z", is_owner: true, is_public: true, avatar_url: null, onboarded: true, discoverable: false, reminders_opt_out: false, notifications_seen_at: now, notify_follows: true, notify_crowns: true, notify_reviews: true, notify_endorsements: true, hidden_cuisine_ids: [], last_rank_min: 9999, tour_seen_at: now, a11y_prefs: {} };
const cuisines = [
  { id: "c0", name: "Overall Favourite", is_default: true, emoji: null },
  { id: "c1", name: "Pizza", is_default: true, emoji: null },
  { id: "c2", name: "Sushi", is_default: true, emoji: null },
  { id: "c3", name: "Wings", is_default: false, emoji: "🍗" },
];
// One friend in your Court, so a crown notification can be tapped through.
const FRIEND = "22222222-2222-2222-2222-222222222222";
const friendProfile = { id: FRIEND, username: "alex", display_name: "Alex", is_owner: false, avatar_url: null };
const follows = [{ follower_id: UID, followee_id: FRIEND, profiles: friendProfile }];
// Alex joined from Steve's invite link.
const invites = [{ invitee_id: FRIEND, inviter_id: UID, created_at: now, profiles: friendProfile }];
const thrones = [{ id: "t2", user_id: FRIEND, cuisine_id: "c2", cuisines: { name: "Sushi" }, profiles: friendProfile, place_name: "FRIEND SUSHI", neighbourhood: "Annex", decree: "The omakase is worth every penny.", photos: [], crowned_at: now, google_place_id: "GID3", lat: 43.6, lng: -79.4 }, { id: "t1", user_id: UID, cuisine_id: "c1", cuisines: { name: "Pizza" }, place_name: "PIZZERIA LIBRETTO", address: "221 Ossington Ave", neighbourhood: "Ossington", decree: "Best margherita in the city, hands down.", photos: [], crowned_at: now, google_place_id: "GID1", lat: 43.6, lng: -79.4, maps_url: "https://www.google.com/maps/search/?api=1&query=x" }];
const nil = [
  { id: "n1", user_id: UID, cuisine_id: "c2", cuisines: { name: "Sushi" }, place_name: "SUSHI PLACE", neighbourhood: "Annex", note: "", photos: [], added_at: now, visited_at: null, google_place_id: "GID2" },
  { id: "n2", user_id: UID, cuisine_id: "c2", cuisines: { name: "Sushi" }, place_name: "BEEN SUSHI", neighbourhood: "Annex", note: "Great", photos: [], added_at: now, visited_at: now, verdict: "worth_it" },
];

function table(url) { return new URL(url).pathname.replace(/^\/rest\/v1\//, ""); }
// Applies the simple eq./in. filters in a query (user_id=eq.x,
// followee_id=in.(a,b)) to rows that have that column, so "my thrones" and
// "my friends' thrones" come back separately. Other filters are ignored.
function filterRows(url, rows) {
  if (!Array.isArray(rows)) return rows;
  let out = rows;
  for (const [key, value] of new URL(url).searchParams) {
    const eq = value.match(/^eq\.(.*)$/);
    const inList = value.match(/^in\.\((.*)\)$/);
    if (!eq && !inList) continue;
    const allowed = eq ? [eq[1]] : inList[1].split(",").map((v) => v.replace(/^"|"$/g, ""));
    out = out.filter((r) => !(key in r) || allowed.includes(String(r[key])));
  }
  return out;
}

(async () => {
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(([key, session]) => localStorage.setItem(key, session), [
    "sb-example-auth-token",
    JSON.stringify({ access_token: "fake", refresh_token: "fake", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }),
  ]);
  const handleSupabase = async (route) => {
    const req = route.request();
    const url = req.url();
    const json = (body, status = 200, headers = {}) => route.fulfill({ status, contentType: "application/json", headers: { "content-range": "0-0/0", ...headers }, body: JSON.stringify(body) });
    if (url.includes("/auth/v1/user")) return json(user);
    if (url.includes("/auth/v1/")) return json({});
    const t = table(url);
    const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    // Your own profile and the owner's user list (both database functions).
    if (t === "rpc/my_profile") return json(profile);
    if (t === "rpc/admin_profiles") return json([profile]);
    if (req.method() !== "GET" && req.method() !== "HEAD") return json(single ? {} : [], 200);
    if (t.startsWith("rpc/")) return json(t.includes("count") ? 0 : []);
    const data = { profiles: single ? profile : [profile], cuisines, thrones, next_in_line: nil, follows, invites, standings: single ? { id: UID, score: 42, thrones: 1, coups: 0 } : [{ id: UID, score: 42 }] }[t];
    if (single) return json(data ?? {});
    return json(filterRows(url, data ?? []));
  };
  await ctx.route("https://example.supabase.co/**", handleSupabase);
  await ctx.route("https://maps.googleapis.com/**", (r) => r.abort());

  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  const step = async (name, fn) => { try { await fn(); console.log("ok   " + name); } catch (e) { errors.push(`${name}: ${e.message.split("\n")[0]}`); console.log("FAIL " + name); } };

  await page.goto(BASE + "/");
  await step("kingdom loads", () => page.getByText("Your one favourite restaurant for each cuisine").first().waitFor({ timeout: 15000 }));
  await step("unsent decree is kept", async () => { await page.getByRole("button", { name: /Crown a spot/ }).first().click(); await page.getByRole("textbox", { name: /Your decree/ }).fill("Half-written thoughts on this place"); await page.keyboard.press("Escape"); await page.getByRole("dialog").first().waitFor({ state: "detached", timeout: 5000 }); await page.getByRole("button", { name: /Crown a spot/ }).first().click(); await page.getByText("Picked up where you left off").waitFor({ timeout: 5000 }); const v = await page.getByRole("textbox", { name: /Your decree/ }).inputValue(); if (v !== "Half-written thoughts on this place") throw new Error("draft not restored: " + v); await page.getByRole("button", { name: "Start over" }).click(); await page.keyboard.press("Escape"); await page.getByRole("dialog").first().waitFor({ state: "detached", timeout: 5000 }); });
  await step("crowned place shows", () => page.getByText("PIZZERIA LIBRETTO").first().waitFor({ timeout: 5000 }));
  await step("next in line tab", async () => { await page.click('[data-tour="tab-pretenders"]'); await page.getByText("SUSHI PLACE").first().waitFor({ timeout: 5000 }); });
  await step("been-to tab", async () => { await page.getByRole("tab", { name: /Been to/ }).click(); await page.getByText("BEEN SUSHI").first().waitFor({ timeout: 5000 }); });
  await step("compact card opens", async () => { await page.getByText("BEEN SUSHI").first().click(); await page.getByRole("button", { name: /Crown it/ }).first().waitFor({ timeout: 5000 }); });
  await step("add a place modal", async () => { await page.getByRole("button", { name: /Add a place/i }).first().click(); await page.getByRole("dialog").first().waitFor({ timeout: 5000 }); await page.keyboard.press("Escape"); await page.getByRole("dialog").first().waitFor({ state: "detached", timeout: 5000 }); });
  await step("privy council opens", async () => { await page.getByRole("button", { name: /Privy Council/ }).click(); await page.getByRole("combobox", { name: "Privy Council cuisine" }).waitFor({ timeout: 5000 }); });
  await step("court tab", async () => { await page.click('[data-tour="tab-court"]'); await page.getByText(/Invite a friend/).first().waitFor({ timeout: 5000 }); });
  await step("best in the land tab", async () => { await page.click('[data-tour="tab-top25"]'); await page.getByText(/picked as a favourite|picked by the friends you follow/).first().waitFor({ timeout: 5000 }); });
  await step("notifications", async () => { await page.click('[data-tour="bell"]'); await page.getByText("Notifications").first().waitFor({ timeout: 5000 }); await page.keyboard.press("Escape"); });
  await step("crown notification opens the pick", async () => { await page.click('[data-tour="bell"]'); await page.getByRole("button", { name: /Alex crowned FRIEND SUSHI - view it/ }).click(); await page.getByRole("dialog").getByText("FRIEND SUSHI").waitFor({ timeout: 5000 }); await page.keyboard.press("Escape"); await page.getByRole("dialog").first().waitFor({ state: "detached", timeout: 5000 }); });
  await step("invite joined notification opens their kingdom", async () => { await page.click('[data-tour="bell"]'); await page.getByRole("button", { name: /Alex joined from your invite - view their kingdom/ }).click(); await page.getByRole("dialog").getByText("FRIEND SUSHI").waitFor({ timeout: 5000 }); await page.keyboard.press("Escape"); await page.getByRole("dialog").first().waitFor({ state: "detached", timeout: 5000 }); });
  await step("invite link shows the invite to a visitor", async () => {
    const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await guest.route("https://example.supabase.co/**", handleSupabase);
    const g = await guest.newPage();
    g.on("pageerror", (e) => errors.push("guest pageerror: " + e.message));
    await g.goto(BASE + "/steve?invite=steve");
    await g.getByText("Steve has invited you to Nomarchy.").waitFor({ timeout: 10000 });
    await g.getByRole("link", { name: /Join Nomarchy/ }).waitFor({ timeout: 5000 });
    const stored = await g.evaluate(() => localStorage.getItem("nomarchy-invite"));
    if (stored !== "steve") throw new Error("invite not remembered: " + stored);
    await guest.close();
  });
  await step("profile modal + accessibility", async () => { await page.getByRole("button", { name: /@steve/ }).click(); await page.getByText("Your profile").first().waitFor({ timeout: 5000 }); await page.getByRole("button", { name: /Accessibility/ }).click(); await page.getByRole("switch", { name: "Larger text" }).click(); const t = await page.evaluate(() => document.documentElement.getAttribute("data-text")); if (t !== "large") throw new Error("larger text not applied"); await page.getByRole("switch", { name: "Larger text" }).click(); await page.keyboard.press("Escape"); });
  await step("profile saves", async () => { await page.getByRole("button", { name: /@steve/ }).click(); await page.getByText("Your profile").first().waitFor({ timeout: 5000 }); await page.getByRole("button", { name: /Settings/ }).click(); await page.getByRole("button", { name: "Save", exact: true }).click(); await page.getByText("Your profile").first().waitFor({ state: "detached", timeout: 5000 }); });
  await step("tour replay", async () => { await page.getByRole("button", { name: /@steve/ }).click(); await page.getByRole("button", { name: /Settings/ }).click(); await page.getByRole("button", { name: "Start" }).click(); await page.locator("[data-tour-box]").waitFor({ timeout: 5000 }); await page.keyboard.press("Escape"); });
  await step("admin tab", async () => { await page.getByRole("button", { name: "Admin" }).click(); await page.getByText(/admin|Loading admin overview|Couldn't load/i).first().waitFor({ timeout: 5000 }); });
  await step("kingdom map view", async () => { await page.click('[data-tour="tab-kingdom"]'); await page.getByRole("button", { name: "Map" }).first().click(); await page.waitForTimeout(500); });

  console.log(errors.length ? "\nPROBLEMS:\n" + errors.join("\n") : "\nSMOKE TEST PASSED");
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
