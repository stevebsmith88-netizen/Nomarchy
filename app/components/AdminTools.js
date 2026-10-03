"use client";

import { useEffect, useState } from "react";
import { C, body } from "../theme";
import { adminCheckClosures, adminClosedPlace, adminPlaceMatch, adminRemoveDecree, loadClosedPlaceRows, supabase } from "@/lib/data";
import { suggestCuisineName } from "@/lib/cuisineFromGoogle";
import { Check, Loader2, Pencil, Search } from "lucide-react";

// Owner-only tool, rendered inside the Admin tab - corrects address,
// neighbourhood, or cuisine on ANY user's crown, never their decree or
// photos (see app/api/admin/fix-throne, which enforces that server-side
// regardless of what this sends). For fixing a bad match from the local
// dataset or lookup that the person who crowned it can't see or isn't
// around to fix themselves.
export function FixThroneTool({ cuisines }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [addressText, setAddressText] = useState("");
  const [areaText, setAreaText] = useState("");
  const [cuisineId, setCuisineId] = useState("");
  const [saving, setSaving] = useState(false);

  const search = async () => {
    if (!query.trim() || searching) return;
    setSearching(true); setErr(""); setResults(null); setEditingId(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/fix-throne?q=${encodeURIComponent(query.trim())}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.results);
    } catch (e) {
      setErr(e.message || "Couldn't search.");
    }
    setSearching(false);
  };

  const startEdit = (r) => {
    setEditingId(r.id);
    setAddressText(r.address || "");
    setAreaText(r.neighbourhood || "");
    setCuisineId("");
  };

  const save = async (r) => {
    setSaving(true); setErr("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/fix-throne", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ throneId: r.id, address: addressText.trim(), neighbourhood: areaText.trim(), cuisineId: cuisineId || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save that.");
      setResults((rs) => rs.map((x) => x.id === r.id
        ? { ...x, address: data.throne.address, neighbourhood: data.throne.neighbourhood, cuisineName: data.throne.cuisines?.name || x.cuisineName, cuisineId: cuisineId || x.cuisineId }
        : x));
      setEditingId(null);
    } catch (e) {
      setErr(e.message || "Couldn't save that.");
    }
    setSaving(false);
  };

  return (
    <div className="mb-5">
      <p className="mb-2 text-xs" style={{ color: C.muted }}>Corrects address, neighbourhood, or cuisine on anyone&apos;s crown - never their review text or photos.</p>
      <div className="flex gap-2">
        <input aria-label="Search by restaurant name" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Search by restaurant name..." className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
        <button onClick={search} disabled={searching || !query.trim()} className="flex shrink-0 items-center justify-center rounded-lg px-3" style={{ background: C.gold, color: C.onGold }}>
          {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        </button>
      </div>
      {err && <p className="mt-2 text-xs" style={{ color: C.coup }}>{err}</p>}
      {results && results.length === 0 && <p className="mt-2 text-sm" style={{ color: C.muted }}>No matches.</p>}
      {results && results.length > 0 && (
        <div className="mt-2 rounded-xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
          {results.map((r, i) => (
            <div key={r.id} className="px-3 py-2.5" style={i > 0 ? { borderTop: `1px solid ${C.cardEdge}` } : undefined}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{r.placeName}</div>
                  <div className="truncate text-xs" style={{ color: C.muted }}>
                    @{r.username || "unknown"} · {r.cuisineName || "Uncategorized"} · {[r.neighbourhood, r.address].filter(Boolean).join(" · ") || "no location on file"}
                  </div>
                </div>
                <button onClick={() => (editingId === r.id ? setEditingId(null) : startEdit(r))} aria-label="Edit" className="shrink-0 rounded-lg p-1.5" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}>
                  <Pencil size={13} />
                </button>
              </div>
              {editingId === r.id && (
                <div className="mt-2 rounded-lg p-2.5" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>Address</label>
                      <input aria-label="Street address" value={addressText} onChange={(e) => setAddressText(e.target.value)} className="mt-1 w-full rounded-lg px-2 py-1.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>Neighbourhood</label>
                      <input aria-label="Neighbourhood" value={areaText} onChange={(e) => setAreaText(e.target.value)} className="mt-1 w-full rounded-lg px-2 py-1.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>Cuisine</label>
                    <select aria-label="Cuisine" value={cuisineId} onChange={(e) => setCuisineId(e.target.value)} className="mt-1 w-full rounded-lg px-2 py-1.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }}>
                      <option value="">Leave as is ({r.cuisineName || "Uncategorized"})</option>
                      {cuisines.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => setEditingId(null)} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}>Cancel</button>
                    <button disabled={saving} onClick={() => save(r)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.gold, color: C.onGold }}>
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// One doubtful place in the backfill review list: Google's candidates, plus
// a way to search again yourself - for a place in another city, one saved
// with only a vague area, or one that's been renamed.
export function ReviewCard({ group: g, saving, hasCoords, entryCount, onChoose, onSkip, onCandidates }) {
  const [query, setQuery] = useState(g.name || "");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const search = async () => {
    if (!query.trim() || busy) return;
    setBusy(true); setNote("");
    try {
      const data = await adminPlaceMatch({ mode: "search", query: query.trim(), city: city.trim() });
      if (data.results.length === 0) setNote("Nothing found - try different words or a city.");
      else onCandidates(data.results);
    } catch (e) {
      setNote(e.message || "Search failed.");
    }
    setBusy(false);
  };

  return (
    <div className="mb-2 rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold">{g.name}</div>
          <div className="truncate text-xs" style={{ color: C.muted }}>{[g.area, g.address].filter(Boolean).join(" · ") || "no location on file"} · {entryCount} saved</div>
        </div>
        <button onClick={onSkip} className="shrink-0 text-xs font-semibold" style={{ color: C.muted }}>Skip</button>
      </div>
      {(g.candidates || (g.match ? [g.match] : [])).map((m) => (
        <button key={m.googlePlaceId} disabled={saving || !hasCoords(m)} onClick={() => onChoose(g, m)} className="mt-1.5 w-full rounded-lg p-2 text-left" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div className="text-sm font-semibold">{m.name}</div>
          <div className="text-xs" style={{ color: C.muted }}>{[m.neighbourhood, m.address].filter(Boolean).join(" · ")}</div>
        </button>
      ))}
      <div className="mt-2 flex gap-1.5">
        <input aria-label="Search again" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="Search again" className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-xs outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
        <input aria-label="City" value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="City" className="w-20 rounded-lg px-2 py-1.5 text-xs outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
        <button onClick={search} disabled={busy || !query.trim()} aria-label="Search" className="flex shrink-0 items-center justify-center rounded-lg px-2.5" style={busy || !query.trim() ? { background: C.cardEdge, color: C.muted } : { background: C.gold, color: C.onGold }}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
        </button>
      </div>
      {note && <p className="mt-1 text-xs" style={{ color: C.muted }}>{note}</p>}
    </div>
  );
}

// One-time Google ID backfill. Scanning searches Google but saves nothing;
// the owner then approves the automatic matches and picks the right result
// for the doubtful ones. See /api/admin/backfill-places.
// Under a reported decree in the Feedback list: removes it after a second
// tap to confirm. The decree becomes a standard notice, the photos are
// cleared, the crown stays, and the author is told.
export function RemoveDecreeButton({ throneId, slug }) {
  const [step, setStep] = useState("idle");
  const [err, setErr] = useState("");
  const remove = async () => {
    setStep("working"); setErr("");
    try {
      await adminRemoveDecree(throneId);
      setStep("done");
    } catch (e) {
      setErr(e.message || "Couldn't remove it.");
      setStep("confirm");
    }
  };
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
      {slug && <a href={`/r/${slug}`} target="_blank" rel="noopener" className="font-semibold underline" style={{ color: C.goldText }}>Open the page</a>}
      {step === "idle" && <button onClick={() => setStep("confirm")} className="font-bold underline" style={{ color: C.coup }}>Remove this decree</button>}
      {step === "confirm" && (<>
        <span style={{ color: C.muted }}>Replace it with a removal notice and tell the author?</span>
        <button onClick={remove} className="rounded-lg px-3 py-1 font-bold" style={{ background: C.coup, color: C.onCoup }}>Yes, remove it</button>
        <button onClick={() => setStep("idle")} className="underline" style={{ color: C.muted }}>Cancel</button>
      </>)}
      {step === "working" && <span style={{ color: C.muted }}><Loader2 size={12} className="inline animate-spin" /> Removing...</span>}
      {step === "done" && <span style={{ color: C.green }}>Removed. The author has been notified.</span>}
      {err && <span style={{ color: C.coup }}>{err}</span>}
    </div>
  );
}

// Second step after matching: places that already have a Google ID but still
// have blank details (cuisine, address, neighbourhood, city, map link). Looks
// each one up by its ID, shows what it would fill, and saves nothing until
// approved. Only blanks are ever filled.
export function PlaceDetailsTool() {
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState({ checked: 0, total: 0 });
  const [groups, setGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const fills = groups.filter((g) => g.status === "fill");
  const unreachable = groups.filter((g) => g.status === "gone" || g.status === "error");
  const sum = (key) => fills.reduce((n, g) => n + g.plan.counts[key], 0);
  const noSuggestion = fills.reduce((n, g) => n + (g.plan.noCuisineSuggestion || 0), 0);

  const scan = async () => {
    setPhase("scanning"); setErr(""); setMsg(""); setGroups([]); setProgress({ checked: 0, total: 0 });
    try {
      let offset = 0;
      let all = [];
      for (;;) {
        const data = await adminPlaceMatch({ mode: "details-preview", offset });
        all = all.concat(data.groups);
        setGroups(all);
        setProgress({ checked: all.length, total: data.total });
        if (data.nextOffset == null) break;
        offset = data.nextOffset;
      }
    } catch (e) {
      setErr(e.message || "The scan stopped early.");
    }
    setPhase("done");
  };

  const save = async () => {
    if (saving || fills.length === 0) return;
    setSaving(true); setErr(""); setMsg("");
    try {
      let rows = 0, cuisines = 0;
      for (let i = 0; i < fills.length; i += 50) {
        const chunk = fills.slice(i, i + 50);
        const data = await adminPlaceMatch({
          mode: "details-apply",
          updates: chunk.map((g) => ({
            thrones: g.thrones, nextInLine: g.nextInLine, googlePlaceId: g.googlePlaceId,
            address: g.plan.values.address || undefined, neighbourhood: g.plan.values.neighbourhood || undefined,
            city: g.plan.values.city || undefined, mapsUrl: g.plan.values.mapsUrl || undefined, cuisine: g.plan.values.cuisine || undefined,
          })),
        });
        rows += data.rows; cuisines += data.cuisinesFilled || 0;
        const done = new Set(chunk.map((g) => g.googlePlaceId));
        setGroups((gs) => gs.filter((g) => !done.has(g.googlePlaceId)));
      }
      setMsg(`Filled in details on ${rows} entr${rows === 1 ? "y" : "ies"}, including ${cuisines} cuisine${cuisines === 1 ? "" : "s"}.`);
    } catch (e) {
      setErr(e.message || "Couldn't save those.");
    }
    setSaving(false);
  };

  return (
    <div className="mb-5">
      <p className="mb-2 text-xs" style={{ color: C.muted }}>
        For places that already have a Google ID but are missing a cuisine, address, neighbourhood, city or map link. Each is looked up by its ID (so it can&apos;t be the wrong restaurant). Scanning only looks; nothing is saved until you approve it, and anything already filled in is left exactly as it is.
      </p>
      <button onClick={scan} disabled={phase === "scanning" || saving} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold" style={phase === "scanning" ? { background: C.cardEdge, color: C.muted } : { background: C.gold, color: C.onGold }}>
        {phase === "scanning" ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
        {phase === "scanning" ? `Checked ${progress.checked} of ${progress.total || "..."}` : phase === "done" ? "Scan again" : "Scan for missing details"}
      </button>
      {err && <p className="mt-2 text-xs" style={{ color: C.coup }}>{err}</p>}
      {msg && <p className="mt-2 text-xs" style={{ color: C.green }}>{msg}</p>}
      {phase === "done" && groups.length === 0 && !err && (
        <p className="mt-2 text-sm" style={{ color: C.muted }}>Nothing missing - every place with a Google ID has its details.</p>
      )}
      {fills.length > 0 && (
        <div className="mt-3 rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
          <div className="text-xs" style={{ color: C.muted }}>
            {fills.length} place{fills.length === 1 ? "" : "s"} to fill · {sum("cuisine")} cuisine{sum("cuisine") === 1 ? "" : "s"} · {sum("address")} address{sum("address") === 1 ? "" : "es"} · {sum("neighbourhood")} neighbourhood{sum("neighbourhood") === 1 ? "" : "s"} · {sum("city")} cit{sum("city") === 1 ? "y" : "ies"} · {sum("mapsUrl")} map link{sum("mapsUrl") === 1 ? "" : "s"}
            {noSuggestion > 0 ? ` · ${noSuggestion} Next in Line entr${noSuggestion === 1 ? "y" : "ies"} Google gave no clear cuisine for (set by hand)` : ""}
          </div>
          <button onClick={save} disabled={saving || phase === "scanning"} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold" style={saving || phase === "scanning" ? { background: C.cardEdge, color: C.muted } : { background: C.gold, color: C.onGold }}>
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Fill in {fills.length} place{fills.length === 1 ? "" : "s"}
          </button>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-semibold" style={{ color: C.muted }}>See what will be filled</summary>
            {fills.map((g) => (
              <div key={g.googlePlaceId} className="mt-2 text-xs" style={{ color: C.muted }}>
                <div><span style={{ color: C.cream, fontWeight: 600 }}>{g.name}</span>{g.matchName && g.matchName.toLowerCase() !== g.name.toLowerCase() ? ` → ${g.matchName}` : ""}</div>
                <div>{[g.plan.counts.cuisine && g.plan.values.cuisine && `cuisine: ${g.plan.values.cuisine}`, g.plan.counts.address && g.plan.values.address, g.plan.counts.neighbourhood && g.plan.values.neighbourhood, g.plan.counts.city && g.plan.values.city].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
          </details>
        </div>
      )}
      {unreachable.length > 0 && phase === "done" && (
        <p className="mt-2 text-xs" style={{ color: C.muted }}>{unreachable.length} place{unreachable.length === 1 ? "" : "s"} couldn&apos;t be looked up (Google doesn&apos;t know the ID any more, or couldn&apos;t be reached): {unreachable.map((g) => g.name).join(", ")}.</p>
      )}
    </div>
  );
}

export function PlaceMatchTool() {
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState({ checked: 0, total: 0 });
  const [groups, setGroups] = useState([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const hasCoords = (m) => typeof m?.lat === "number" && typeof m?.lng === "number";
  // Besides the Google ID and pin, the matched place's address, map link and
  // (for Next in Line entries) suggested cuisine are sent so blanks get
  // filled in - the server only ever fills fields that are empty.
  const toUpdate = (g, m) => ({
    thrones: g.thrones, nextInLine: g.nextInLine, googlePlaceId: m.googlePlaceId, lat: m.lat, lng: m.lng,
    address: m.address || undefined, neighbourhood: m.neighbourhood || undefined, mapsUrl: m.mapsUrl || undefined,
    city: g.city || undefined, cuisine: g.nextInLine.length ? suggestCuisineName(m.primaryType, m.types) || undefined : undefined,
  });
  const entryCount = (g) => g.thrones.length + g.nextInLine.length;

  const auto = groups.filter((g) => g.status === "auto" && hasCoords(g.match));
  // Places Google couldn't find get a review card too (with no candidates),
  // so there's always a search box to try again with different words.
  const review = groups.filter((g) => g.status === "review" || g.status === "none" || (g.status === "auto" && !hasCoords(g.match)));
  const failed = groups.filter((g) => g.status === "error");

  const scan = async () => {
    setPhase("scanning"); setErr(""); setMsg(""); setGroups([]); setProgress({ checked: 0, total: 0 });
    try {
      let offset = 0;
      let all = [];
      for (;;) {
        const data = await adminPlaceMatch({ mode: "preview", offset });
        all = all.concat(data.groups);
        setGroups(all);
        setProgress({ checked: all.length, total: data.total });
        if (data.nextOffset == null) break;
        offset = data.nextOffset;
      }
    } catch (e) {
      setErr(e.message || "The scan stopped early.");
    }
    setPhase("done");
  };

  const remove = (key) => setGroups((gs) => gs.filter((g) => g.key !== key));

  const saveAuto = async () => {
    if (saving || auto.length === 0) return;
    setSaving(true); setErr(""); setMsg("");
    try {
      let saved = 0, filled = 0;
      for (let i = 0; i < auto.length; i += 50) {
        const chunk = auto.slice(i, i + 50);
        const data = await adminPlaceMatch({ mode: "apply", updates: chunk.map((g) => toUpdate(g, g.match)) });
        saved += data.saved;
        filled += data.cuisinesFilled || 0;
        chunk.forEach((g) => remove(g.key));
      }
      setMsg(`Saved ${saved} entr${saved === 1 ? "y" : "ies"} across ${auto.length} place${auto.length === 1 ? "" : "s"}${filled ? `, and filled in ${filled} cuisine${filled === 1 ? "" : "s"}` : ""}.`);
    } catch (e) {
      setErr(e.message || "Couldn't save those.");
    }
    setSaving(false);
  };

  const choose = async (g, m) => {
    if (saving || !hasCoords(m)) return;
    setSaving(true); setErr(""); setMsg("");
    try {
      await adminPlaceMatch({ mode: "apply", updates: [toUpdate(g, m)] });
      remove(g.key);
      setMsg(`Matched ${g.name}.`);
    } catch (e) {
      setErr(e.message || "Couldn't save that.");
    }
    setSaving(false);
  };

  return (
    <div className="mb-5">
      <p className="mb-2 text-xs" style={{ color: C.muted }}>
        Finds the real Google place for saved crowns and Next in Line entries that don&apos;t have one yet. Scanning only looks - nothing is saved until you approve it. Approved places get their Google ID, map pin, and any blank address, neighbourhood, map link or (Next in Line) cuisine filled in. Anything already filled in, and every name, decree and note, is left exactly as it is. A place with no saved address is matched by name alone.
      </p>
      <button onClick={scan} disabled={phase === "scanning" || saving} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold" style={phase === "scanning" ? { background: C.cardEdge, color: C.muted } : { background: C.gold, color: C.onGold }}>
        {phase === "scanning" ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
        {phase === "scanning" ? `Checked ${progress.checked} of ${progress.total || "..."}` : phase === "done" ? "Scan again" : "Scan places"}
      </button>
      {err && <p className="mt-2 text-xs" style={{ color: C.coup }}>{err}</p>}
      {msg && <p className="mt-2 text-xs" style={{ color: C.green }}>{msg}</p>}

      {phase !== "idle" && groups.length === 0 && phase === "done" && !err && (
        <p className="mt-2 text-sm" style={{ color: C.muted }}>Nothing left to match - every saved place already has a Google ID.</p>
      )}

      {groups.length > 0 && (
        <div className="mt-3 rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
          <div className="text-xs" style={{ color: C.muted }}>
            {auto.length} clear match{auto.length === 1 ? "" : "es"} · {review.length} to review{failed.length > 0 ? ` · ${failed.length} couldn't be checked` : ""}
          </div>
          {auto.length > 0 && (
            <button onClick={saveAuto} disabled={saving || phase === "scanning"} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold" style={saving || phase === "scanning" ? { background: C.cardEdge, color: C.muted } : { background: C.gold, color: C.onGold }}>
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Save {auto.length} clear match{auto.length === 1 ? "" : "es"} ({auto.reduce((n, g) => n + entryCount(g), 0)} entries)
            </button>
          )}
          {auto.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold" style={{ color: C.muted }}>See the clear matches</summary>
              {auto.map((g) => (
                <div key={g.key} className="mt-2 text-xs" style={{ color: C.muted }}>
                  <div><span style={{ color: C.cream, fontWeight: 600 }}>{g.name}</span>{g.address ? ` · ${g.address}` : ""}</div>
                  <div>→ {g.match.name}{g.match.address ? ` · ${g.match.address}` : ""}</div>
                  {g.nextInLine.length > 0 && suggestCuisineName(g.match.primaryType, g.match.types) && (
                    <div>Cuisine, if blank: {suggestCuisineName(g.match.primaryType, g.match.types)}</div>
                  )}
                  {g.evidence && <div style={{ color: C.green }}>{g.evidence}</div>}
                </div>
              ))}
            </details>
          )}
        </div>
      )}

      {review.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>To review ({review.length})</div>
          {review.map((g) => (
            <ReviewCard
              key={g.key}
              group={g}
              saving={saving}
              hasCoords={hasCoords}
              entryCount={entryCount(g)}
              onChoose={choose}
              onSkip={() => remove(g.key)}
              onCandidates={(candidates) => setGroups((gs) => gs.map((x) => (x.key === g.key ? { ...x, status: "review", candidates } : x)))}
            />
          ))}
        </div>
      )}

      {failed.length > 0 && phase === "done" && (
        <p className="mt-2 text-xs" style={{ color: C.muted }}>
          Couldn&apos;t be checked (Google error - try scanning again): {failed.map((g) => g.name).join(", ")}.
        </p>
      )}
    </div>
  );
}

// Owner-run: asks Google which saved places are now permanently closed.
// Checking only looks - nothing is saved. A place is only marked closed when
// the owner presses "Mark as closed" on it, and that can be undone below.
// See /api/admin/check-closures and /api/admin/closed-places.
export function ClosureCheckTool() {
  const [phase, setPhase] = useState("idle");
  const [progress, setProgress] = useState({ checked: 0, total: 0 });
  const [closed, setClosed] = useState([]);
  const [gone, setGone] = useState([]);
  const [errors, setErrors] = useState(0);
  const [err, setErr] = useState("");
  const [marked, setMarked] = useState(null); // rows already marked closed
  const [busyId, setBusyId] = useState(null);
  const [actionErr, setActionErr] = useState("");

  useEffect(() => {
    loadClosedPlaceRows().then(setMarked).catch(() => setMarked([]));
  }, []);

  const markedIds = new Set((marked || []).map((m) => m.placeId));

  const run = async () => {
    setPhase("running"); setErr(""); setClosed([]); setGone([]); setErrors(0); setProgress({ checked: 0, total: 0 });
    try {
      let offset = 0;
      let checked = 0;
      let closedAll = [], goneAll = [], errorCount = 0;
      for (;;) {
        const data = await adminCheckClosures(offset);
        closedAll = closedAll.concat(data.closed);
        goneAll = goneAll.concat(data.gone);
        errorCount += data.errors;
        checked = data.nextOffset == null ? data.total : data.nextOffset;
        setClosed(closedAll); setGone(goneAll); setErrors(errorCount);
        setProgress({ checked, total: data.total });
        if (data.nextOffset == null) break;
        offset = data.nextOffset;
      }
    } catch (e) {
      setErr(e.message || "The check stopped early.");
    }
    setPhase("done");
  };

  const change = async (action, placeId) => {
    if (busyId) return;
    setBusyId(placeId); setActionErr("");
    try {
      await adminClosedPlace(action, placeId);
      setMarked(await loadClosedPlaceRows());
    } catch (e) {
      setActionErr(e.message || "Couldn't update that place.");
    }
    setBusyId(null);
  };

  const entryText = (p) => {
    const parts = [];
    if (p.crowns) parts.push(`${p.crowns} crown${p.crowns === 1 ? "" : "s"}`);
    if (p.lists) parts.push(`${p.lists} on a list`);
    return parts.join(" · ");
  };
  const placeRow = (p, i) => (
    <div key={`${p.placeId}-${i}`} className="mt-2 flex items-start justify-between gap-3 text-xs" style={{ color: C.muted }}>
      <div className="min-w-0">
        <span style={{ color: C.cream, fontWeight: 600 }}>{p.name}</span>{p.address ? ` · ${p.address}` : ""}
        <div>{entryText(p)}</div>
      </div>
      {markedIds.has(p.placeId) ? (
        <span className="shrink-0 font-bold" style={{ color: C.green }}>Marked</span>
      ) : (
        <button onClick={() => change("mark", p.placeId)} disabled={!!busyId} className="shrink-0 rounded-lg px-2.5 py-1.5 font-bold" style={busyId ? { background: C.cardEdge, color: C.muted } : { background: C.coup + "22", color: C.coup, border: `1px solid ${C.coup}66` }}>
          {busyId === p.placeId ? "..." : "Mark as closed"}
        </button>
      )}
    </div>
  );

  return (
    <div className="mb-5">
      <p className="mb-2 text-xs" style={{ color: C.muted }}>
        Asks Google which saved places have permanently closed. Checking only looks - a place is only marked closed when you press the button on it. Marking greys it out for everyone who saved it, takes it off the maps, Best in the Land and recommendations, and tells each of them. Worth running every few months.
      </p>
      <button onClick={run} disabled={phase === "running"} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold" style={phase === "running" ? { background: C.cardEdge, color: C.muted } : { background: C.gold, color: C.onGold }}>
        {phase === "running" ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
        {phase === "running" ? `Checked ${progress.checked} of ${progress.total || "..."}` : phase === "done" ? "Check again" : "Check for closures"}
      </button>
      {err && <p className="mt-2 text-xs" style={{ color: C.coup }}>{err}</p>}
      {actionErr && <p className="mt-2 text-xs" style={{ color: C.coup }}>{actionErr}</p>}

      {phase === "done" && !err && (
        <div className="mt-3 rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
          <div className="text-xs" style={{ color: C.muted }}>
            Checked {progress.total} place{progress.total === 1 ? "" : "s"} · {closed.length} permanently closed · {gone.length} Google can&apos;t find{errors > 0 ? ` · ${errors} couldn't be checked (try again)` : ""}
          </div>
          {closed.length === 0 && gone.length === 0 && (
            <p className="mt-2 text-sm" style={{ color: C.green }}>No closures found.</p>
          )}
          {closed.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>Permanently closed ({closed.length})</div>
              {closed.map(placeRow)}
            </div>
          )}
          {gone.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>Google can&apos;t find ({gone.length})</div>
              {gone.map(placeRow)}
            </div>
          )}
        </div>
      )}

      {marked && marked.length > 0 && (
        <div className="mt-3 rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
          <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>Marked as closed ({marked.length})</div>
          {marked.map((m) => (
            <div key={m.placeId} className="mt-2 flex items-center justify-between gap-3 text-xs" style={{ color: C.muted }}>
              <span className="min-w-0 truncate"><span style={{ color: C.cream, fontWeight: 600 }}>{m.name}</span> · {new Date(m.closedAt).toLocaleDateString()}</span>
              <button onClick={() => change("reopen", m.placeId)} disabled={!!busyId} className="shrink-0 rounded-lg px-2.5 py-1.5 font-bold" style={{ border: `1px solid ${C.cardEdge}`, color: C.muted }}>
                {busyId === m.placeId ? "..." : "Reopen"}
              </button>
            </div>
          ))}
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: C.muted }}>
            Reopening removes the grey-out straight away and brings the map pins back within a day.
          </p>
        </div>
      )}
    </div>
  );
}
