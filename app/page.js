"use client";

import { useState, useEffect } from "react";
import {
  Crown, Plus, ScrollText, Swords, X, Users, Award, ChevronDown, ChevronUp,
  MapPin, Search, Star, ExternalLink, Loader2, Bookmark, Share2, Check, Trash2,
  ClipboardPaste, Wand2, LogOut, UserPlus,
} from "lucide-react";
import {
  supabase, getUser, onAuthChange, signIn, signOut, getProfile,
  loadKingdom, loadNextInLine, loadCuisines, addCuisine,
  crownSpot, promoteToThrone, addToNextInLine, importToNextInLine, removeFromNextInLine,
  loadCourt, toggleEndorsement, followByUsername, loadStanding,
} from "@/lib/data";

const C = {
  bg: "#1C1326", card: "#2A1D38", cardEdge: "#41305A",
  gold: "#E3B341", cream: "#F4ECDD", muted: "#A795BD",
  coup: "#E85D4A", green: "#7FB069",
};
const display = { fontFamily: "'Fraunces', serif" };
const body = { fontFamily: "'Archivo', sans-serif" };

const RANKS = [
  { min: 0, title: "Peckish Peasant", note: "Everyone starts hungry." },
  { min: 40, title: "Court Taster", note: "Your palate is earning trust." },
  { min: 100, title: "Noble of Nibbles", note: "People are starting to listen." },
  { min: 180, title: "Duke of Dinner", note: "Your word carries weight at the table." },
  { min: 280, title: "Monarch of Taste", note: "Long may you reign." },
];

const MIN_DECREE_LENGTH = 30;

export default function Nomarchy() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [profile, setProfile] = useState(null);

  const [tab, setTab] = useState("kingdom");
  const [slots, setSlots] = useState({});
  const [pretenders, setPretenders] = useState([]);
  const [cuisineList, setCuisineList] = useState([]);
  const [standing, setStanding] = useState(null);
  const [court, setCourt] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [modal, setModal] = useState(null);
  const [addPretender, setAddPretender] = useState(false);
  const [importing, setImporting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState({});
  const [newCuisine, setNewCuisine] = useState("");
  const [addingCuisine, setAddingCuisine] = useState(false);
  const [onlyCrowned, setOnlyCrowned] = useState(false);
  const [toast, setToast] = useState("");

  const [followInput, setFollowInput] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState("");

  useEffect(() => {
    getUser().then((u) => { setUser(u); setAuthChecked(true); });
    return onAuthChange((u) => setUser(u));
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [k, n, c, s, crt, p] = await Promise.all([
          loadKingdom(user.id),
          loadNextInLine(user.id),
          loadCuisines(user.id),
          loadStanding(user.id),
          loadCourt(user.id),
          getProfile(user.id),
        ]);
        setSlots(k); setPretenders(n); setCuisineList(c);
        setStanding(s); setCourt(crt); setProfile(p);
      } catch (err) {
        setLoadError(err.message);
      }
      setLoaded(true);
    })();
  }, [user]);

  const flash = (m) => { setToast(m); setTimeout(() => setToast(""), 2200); };

  const refreshKingdom = async () => setSlots(await loadKingdom(user.id));
  const refreshPretenders = async () => setPretenders(await loadNextInLine(user.id));
  const refreshCuisines = async () => setCuisineList(await loadCuisines(user.id));
  const refreshStanding = async () => setStanding(await loadStanding(user.id));
  const refreshCourt = async () => setCourt(await loadCourt(user.id));

  const cuisineNames = cuisineList.map((c) => c.name);

  const crown = async (cuisineId, entry, fromPretenderId) => {
    const cuisineName = cuisineList.find((c) => c.id === cuisineId)?.name || "";
    await promoteToThrone(user.id, cuisineId, entry, fromPretenderId);
    await refreshKingdom();
    if (fromPretenderId) await refreshPretenders();
    await refreshStanding();
    setModal(null);
    flash(fromPretenderId ? `${entry.name} promoted to the ${cuisineName} throne` : `${entry.name} crowned`);
  };

  const addToPretenders = async (cuisineId, entry) => {
    if (pretenders.some((p) => p.name.toLowerCase() === entry.name.toLowerCase())) {
      flash("Already on your shortlist");
      return;
    }
    await addToNextInLine(user.id, { ...entry, cuisineId });
    await refreshPretenders();
    setAddPretender(false);
    flash(`${entry.name} is next in line`);
  };

  const handleRemovePretender = async (id) => {
    await removeFromNextInLine(id);
    await refreshPretenders();
  };

  // Bulk import: resolve each row's cuisine name to an existing id, or
  // create it. Sequential on purpose - two rows guessing the same brand
  // new cuisine must not both try to create it.
  const importMany = async (rows) => {
    let added = 0, skipped = 0;
    const existingNames = new Set(pretenders.map((p) => p.name.toLowerCase().trim()));
    let localCuisines = cuisineList;
    const resolved = [];
    for (const r of rows) {
      const key = r.name.toLowerCase().trim();
      if (existingNames.has(key)) { skipped++; continue; }
      existingNames.add(key);
      let match = localCuisines.find((c) => c.name.toLowerCase() === (r.cuisine || "").toLowerCase().trim());
      if (!match && r.cuisine?.trim()) {
        try {
          match = await addCuisine(user.id, r.cuisine.trim());
          localCuisines = [...localCuisines, match];
        } catch {
          match = null;
        }
      }
      resolved.push({ name: r.name, area: r.area || null, note: r.note || null, cuisineId: match?.id || null });
      added++;
    }
    if (resolved.length) await importToNextInLine(user.id, resolved);
    setCuisineList(localCuisines);
    await refreshPretenders();
    setImporting(false);
    setTab("pretenders");
    flash(`${added} imported${skipped ? `, ${skipped} already on your list` : ""}`);
  };

  const sharePick = async (cuisineName, r) => {
    const text = `My ${cuisineName} throne on Nomarchy: ${r.name}${r.area ? ` (${r.area})` : ""}\n\n"${r.decree}"`;
    try {
      await navigator.clipboard.writeText(text);
      flash("Pick copied, paste it in the group chat");
    } catch {
      flash("Couldn't copy on this device");
    }
  };

  const handleAddCuisine = async () => {
    const v = newCuisine.trim();
    if (!v) return;
    if (cuisineNames.some((n) => n.toLowerCase() === v.toLowerCase())) {
      flash("Already have that one");
      setNewCuisine(""); setAddingCuisine(false);
      return;
    }
    try {
      await addCuisine(user.id, v);
      await refreshCuisines();
    } catch (err) {
      flash(err.message);
    }
    setNewCuisine(""); setAddingCuisine(false);
  };

  const handleEndorse = async (throneId, currentlyEndorsed) => {
    await toggleEndorsement(user.id, throneId, currentlyEndorsed);
    await refreshCourt();
  };

  const handleAddFollow = async (e) => {
    e.preventDefault();
    if (!followInput.trim() || followBusy) return;
    setFollowBusy(true); setFollowError("");
    try {
      await followByUsername(user.id, followInput.trim());
      setFollowInput("");
      await refreshCourt();
      flash("Following now");
    } catch (err) {
      setFollowError(err.message);
    }
    setFollowBusy(false);
  };

  const addFriendPickToPretenders = (friendName, pick) =>
    addToPretenders(pick.cuisineId, {
      name: pick.name,
      area: pick.area,
      note: `${friendName} swears by this one.`,
    });

  if (!authChecked) {
    return <FontShell><div className="flex min-h-screen items-center justify-center" style={{ color: C.muted, ...body }}>Loading...</div></FontShell>;
  }

  if (!user) {
    return <SignInScreen />;
  }

  const thrones = standing?.thrones ?? 0;
  const coups = standing?.coups ?? 0;
  const endorseCount = court.reduce((n, f) => n + f.picks.filter((p) => p.endorsedByMe).length, 0);
  const score = standing?.score ?? 0;
  const rank = [...RANKS].reverse().find((r) => score >= r.min) || RANKS[0];
  const nextRank = RANKS.find((r) => r.min > score);
  const fmt = (t) => new Date(t).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
  const shown = onlyCrowned ? cuisineNames.filter((c) => slots[c]?.current) : cuisineNames;

  return (
    <FontShell>
      <header className="px-5 pt-7 pb-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <Crown size={24} style={{ color: C.gold }} strokeWidth={1.6} />
          <h1 className="text-3xl tracking-wide" style={{ ...display, fontWeight: 900 }}>NOMARCHY</h1>
          <Crown size={24} style={{ color: C.gold, transform: "scaleX(-1)" }} strokeWidth={1.6} />
        </div>
        <p className="mt-1 text-sm italic" style={{ ...display, color: C.muted }}>Long live your favourites.</p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: C.card, color: C.muted, border: `1px solid ${C.cardEdge}` }}>
            @{profile?.username}
          </span>
          <button onClick={signOut} className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}>
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </header>

      {loadError && (
        <div className="mx-auto mb-4 max-w-2xl rounded-lg px-4 py-2 text-center text-sm" style={{ background: C.coup + "18", color: C.coup }}>
          {loadError}
        </div>
      )}

      <nav className="flex flex-wrap justify-center gap-2 px-4 pb-5">
        {[{ id: "kingdom", label: "Kingdom", icon: Crown }, { id: "pretenders", label: "Next in Line", icon: Bookmark }, { id: "court", label: "Court", icon: Users }, { id: "standing", label: "Standing", icon: Award }].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
            style={tab === id ? { background: C.gold, color: C.bg } : { background: C.card, color: C.muted, border: `1px solid ${C.cardEdge}` }}>
            <Icon size={15} strokeWidth={2.2} />{label}
            {id === "pretenders" && pretenders.length > 0 && <span className="rounded-full px-1.5 text-xs" style={{ background: tab === id ? C.bg : C.cardEdge, color: tab === id ? C.gold : C.cream }}>{pretenders.length}</span>}
          </button>
        ))}
      </nav>

      <main className="mx-auto max-w-2xl px-5 pb-28">
        {!loaded ? (
          <p className="text-center text-sm" style={{ color: C.muted }}>Loading your kingdom...</p>
        ) : (<>
        {/* KINGDOM */}
        {tab === "kingdom" && (<div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm" style={{ color: C.muted }}>One throne per cuisine. Choose like it matters.</p>
            <button onClick={() => setOnlyCrowned(!onlyCrowned)} className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: onlyCrowned ? C.gold : C.card, color: onlyCrowned ? C.bg : C.muted, border: `1px solid ${C.cardEdge}` }}>
              {onlyCrowned ? "Showing crowned" : "Show all"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shown.map((cuisineName) => {
              const cuisineId = cuisineList.find((c) => c.name === cuisineName)?.id;
              const slot = slots[cuisineName]; const r = slot?.current; const fallenList = slot?.fallen || [];
              const open = historyOpen[cuisineName];
              return (
                <div key={cuisineName} className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${r ? C.gold + "55" : C.cardEdge}` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.14em" }}>{cuisineName}</span>
                    {r && <Crown size={16} style={{ color: C.gold }} fill={C.gold} strokeWidth={0} />}
                  </div>
                  {r ? (<div className="mt-2">
                    <h3 className="text-xl" style={{ ...display, fontWeight: 700 }}>{r.name}</h3>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs" style={{ color: C.muted }}>
                      {(r.area || r.address) && (<><MapPin size={11} /> {r.area || r.address}<span className="mx-1">·</span></>)}
                      {r.rating && (<><Star size={11} style={{ color: C.gold }} fill={C.gold} /> {r.rating}<span className="mx-1">·</span></>)}
                      crowned {fmt(r.crownedAt)}
                      {r.mapsUrl && <a href={r.mapsUrl} target="_blank" rel="noreferrer" className="ml-1 flex items-center gap-0.5 font-semibold" style={{ color: C.gold }}>Map <ExternalLink size={10} /></a>}
                    </div>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: C.cream + "E6" }}>
                      <ScrollText size={13} className="mr-1 inline" style={{ color: C.gold }} />{r.decree}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button onClick={() => setModal({ cuisineId, cuisineName, mode: "coup" })} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.coup + "22", color: C.coup, border: `1px solid ${C.coup}66` }}><Swords size={13} /> Coup</button>
                      <button onClick={() => sharePick(cuisineName, r)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}><Share2 size={13} /> Share</button>
                      {fallenList.length > 0 && <button onClick={() => setHistoryOpen((p) => ({ ...p, [cuisineName]: !p[cuisineName] }))} className="flex items-center gap-1 px-1 text-xs font-semibold" style={{ color: C.muted }}>{fallenList.length} fallen {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>}
                    </div>
                    {open && fallenList.map((f, i) => (
                      <div key={i} className="mt-2 rounded-lg p-3 text-xs" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
                        <div className="font-bold" style={{ color: C.muted }}>{f.name} <span className="font-normal">· reigned until {fmt(f.dethronedAt)}</span></div>
                        <p className="mt-1 italic" style={{ color: C.muted }}>&ldquo;{f.decree}&rdquo;</p>
                      </div>))}
                  </div>) : (<div className="mt-2">
                    <p className="text-sm italic" style={{ color: C.muted }}>This throne sits empty.</p>
                    <button onClick={() => setModal({ cuisineId, cuisineName, mode: "claim" })} className="mt-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.gold, color: C.bg }}><Crown size={13} /> Crown a spot</button>
                  </div>)}
                </div>);
            })}

            {!onlyCrowned && (<div className="flex min-h-28 flex-col items-center justify-center rounded-xl p-4" style={{ border: `1px dashed ${C.cardEdge}` }}>
              {addingCuisine ? (<div className="flex w-full gap-2">
                <input autoFocus value={newCuisine} onChange={(e) => setNewCuisine(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddCuisine()} placeholder="e.g. Pho, Wings" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
                <button onClick={handleAddCuisine} className="rounded-lg px-3 text-sm font-bold" style={{ background: C.gold, color: C.bg }}>Add</button>
              </div>) : (<button onClick={() => setAddingCuisine(true)} className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: C.muted }}><Plus size={15} /> Add a cuisine</button>)}
            </div>)}
          </div>
        </div>)}

        {/* PRETENDERS */}
        {tab === "pretenders" && (<div>
          <p className="mb-3 text-sm" style={{ color: C.muted }}>The places waiting for their shot at a throne. Go, eat, then decide.</p>
          <div className="mb-4 flex gap-2">
            <button onClick={() => setAddPretender(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold" style={{ background: C.gold, color: C.bg }}><Plus size={16} /> Add a place</button>
            <button onClick={() => setImporting(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold" style={{ border: `1px solid ${C.gold}66`, color: C.gold }}><ClipboardPaste size={16} /> Import a list</button>
          </div>

          {pretenders.length === 0 ? (
            <div className="rounded-xl p-6 text-center" style={{ background: C.card, border: `1px dashed ${C.cardEdge}` }}>
              <Bookmark size={26} className="mx-auto" style={{ color: C.muted }} />
              <p className="mt-2 text-sm" style={{ color: C.muted }}>Nothing waiting in throne just yet. Add the places you keep meaning to try, then promote the good ones.</p>
              <p className="mt-2 text-sm" style={{ color: C.muted }}>Already got a list in Notes or a spreadsheet? Paste the whole thing into Import and it&apos;ll sort it out.</p>
            </div>
          ) : pretenders.map((p) => (
            <div key={p.id} className="mb-3 rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>{p.name}</h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs" style={{ color: C.muted }}>
                    {p.cuisine && <span className="rounded px-1.5 py-0.5 font-bold uppercase" style={{ background: C.bg, letterSpacing: "0.1em" }}>{p.cuisine}</span>}
                    {(p.area || p.address) && <><MapPin size={11} /> {p.area || p.address}</>}
                    {p.rating && <><Star size={11} style={{ color: C.gold }} fill={C.gold} /> {p.rating}</>}
                    {p.mapsUrl && <a href={p.mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 font-semibold" style={{ color: C.gold }}>Map <ExternalLink size={10} /></a>}
                  </div>
                </div>
                <button onClick={() => handleRemovePretender(p.id)} aria-label="Remove" style={{ color: C.muted }}><Trash2 size={15} /></button>
              </div>
              {p.note && <p className="mt-2 text-sm italic leading-relaxed" style={{ color: C.cream + "CC" }}>{p.note}</p>}
              <button
                onClick={() => setModal({
                  cuisineId: p.cuisineId || cuisineList[0]?.id,
                  cuisineName: p.cuisine || cuisineList[0]?.name,
                  mode: p.cuisine && slots[p.cuisine]?.current ? "coup" : "claim",
                  prefill: p,
                  pretenderId: p.id,
                })}
                className="mt-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.gold, color: C.bg }}>
                <Crown size={13} /> I&apos;ve been. Crown it
              </button>
            </div>
          ))}
        </div>)}

        {/* COURT */}
        {tab === "court" && (<div>
          <p className="mb-3 text-sm" style={{ color: C.muted }}>Your friends&apos; reigning picks. Endorse the good ones, or add them to your own shortlist.</p>

          <form onSubmit={handleAddFollow} className="mb-4 flex gap-2">
            <input value={followInput} onChange={(e) => setFollowInput(e.target.value)} placeholder="Follow by username" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
            <button type="submit" disabled={followBusy || !followInput.trim()} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-bold" style={{ background: C.gold, color: C.bg }}>
              {followBusy ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />} Follow
            </button>
          </form>
          {followError && <p className="mb-3 text-xs" style={{ color: C.coup }}>{followError}</p>}

          {court.length === 0 ? (
            <div className="rounded-xl p-6 text-center" style={{ background: C.card, border: `1px dashed ${C.cardEdge}` }}>
              <Users size={26} className="mx-auto" style={{ color: C.muted }} />
              <p className="mt-2 text-sm" style={{ color: C.muted }}>Nobody in your court yet. Follow a friend by username above, and share yours (@{profile?.username}) so they can follow you back.</p>
            </div>
          ) : court.map((f) => (
            <div key={f.id} className="mb-4 rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
              <div className="flex items-baseline justify-between">
                <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>{f.name}</h3>
                <span className="text-xs font-semibold" style={{ color: C.gold }}>{f.score}</span>
              </div>
              {f.picks.length === 0 && <p className="mt-2 text-xs" style={{ color: C.muted }}>No thrones claimed yet.</p>}
              {f.picks.map((p) => (
                <div key={p.id} className="mt-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
                  <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>{p.cuisine}</div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <div><span style={{ ...display, fontWeight: 700 }} className="text-base">{p.name}</span><span className="ml-2 text-xs" style={{ color: C.muted }}>{p.area}</span></div>
                    <button onClick={() => handleEndorse(p.id, p.endorsedByMe)} className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
                      style={p.endorsedByMe ? { background: C.gold, color: C.bg } : { border: `1px solid ${C.cardEdge}`, color: C.muted }}>
                      <Crown size={12} /> {p.endorsedByMe ? "Endorsed" : "Endorse"}
                    </button>
                  </div>
                  <p className="mt-1.5 text-sm italic leading-relaxed" style={{ color: C.cream + "CC" }}>&ldquo;{p.decree}&rdquo;</p>
                  <button onClick={() => addFriendPickToPretenders(f.name, p)}
                    className="mt-2 flex items-center gap-1.5 text-xs font-bold" style={{ color: C.gold }}><Bookmark size={12} /> Add to my list</button>
                </div>))}
            </div>))}
        </div>)}

        {/* STANDING */}
        {tab === "standing" && (<div className="text-center">
          <div className="mx-auto max-w-md rounded-xl p-6" style={{ background: C.card, border: `1px solid ${C.gold}55` }}>
            <Crown size={34} className="mx-auto" style={{ color: C.gold }} fill={C.gold} strokeWidth={0} />
            <h2 className="mt-2 text-2xl" style={{ ...display, fontWeight: 900 }}>{rank.title}</h2>
            <p className="mt-1 text-sm italic" style={{ color: C.muted }}>{rank.note}</p>
            <div className="mt-4 text-5xl" style={{ ...display, fontWeight: 900, color: C.gold }}>{score}</div>
            <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.14em" }}>Taste credibility</div>
            {nextRank && (<div className="mt-4">
              <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: C.bg }}>
                <div className="h-full rounded-full" style={{ background: C.gold, width: `${Math.min(100, (score / nextRank.min) * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-xs" style={{ color: C.muted }}>{nextRank.min - score} to {nextRank.title}</p>
            </div>)}
          </div>
          <div className="mx-auto mt-4 grid max-w-md grid-cols-2 gap-3 text-left">
            {[{ n: thrones, label: "Thrones claimed", hint: "Crown more cuisines" },
              { n: coups, label: "Coups staged", hint: "Better spots dethrone old ones" },
              { n: pretenders.length, label: "Next in line", hint: "Go try them" },
              { n: endorseCount, label: "Endorsements given", hint: "Crown your friends' picks" }].map((s) => (
              <div key={s.label} className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
                <div className="text-2xl" style={{ ...display, fontWeight: 700, color: C.gold }}>{s.n}</div>
                <div className="text-xs font-semibold">{s.label}</div>
                <div className="mt-0.5 text-xs" style={{ color: C.muted }}>{s.hint}</div>
              </div>))}
          </div>
          <p className="mx-auto mt-5 max-w-md text-xs leading-relaxed" style={{ color: C.muted }}>
            Credibility rewards conviction and depth, not hype. Honest write ups about real favourites outrank trendy picks with lazy decrees.
          </p>
        </div>)}
        </>)}
      </main>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg" style={{ background: C.gold, color: C.bg }}>
          <Check size={14} className="mr-1 inline" />{toast}
        </div>)}

      {modal && (
        <PlaceModal
          mode={modal.mode}
          cuisineId={modal.cuisineId}
          cuisineName={modal.cuisineName}
          cuisines={cuisineList}
          prefill={modal.prefill}
          reigning={slots[modal.cuisineName]?.current}
          defaultCity={profile?.city || "Toronto"}
          onClose={() => setModal(null)}
          onSubmit={(cid, entry) => crown(cid, entry, modal.pretenderId)}
        />
      )}

      {importing && (
        <ImportModal
          cuisineNames={cuisineNames}
          onClose={() => setImporting(false)}
          onImport={importMany}
        />
      )}

      {addPretender && cuisineList.length > 0 && (
        <PlaceModal
          mode="pretender"
          cuisineId={cuisineList[0]?.id}
          cuisineName={cuisineList[0]?.name}
          cuisines={cuisineList}
          defaultCity={profile?.city || "Toronto"}
          onClose={() => setAddPretender(false)}
          onSubmit={(cid, entry) => addToPretenders(cid, entry)}
        />
      )}
    </FontShell>
  );
}

function FontShell({ children }) {
  return (
    <div className="min-h-screen w-full" style={{ background: C.bg, color: C.cream, ...body }}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet" />
      {children}
    </div>
  );
}

function SignInScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    try {
      await signIn(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  };

  return (
    <FontShell>
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-sm rounded-2xl p-7 text-center" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
          <div className="flex items-center justify-center gap-2">
            <Crown size={24} style={{ color: C.gold }} strokeWidth={1.6} />
            <h1 className="text-2xl tracking-wide" style={{ ...display, fontWeight: 900 }}>NOMARCHY</h1>
          </div>
          <p className="mt-1 mb-6 text-sm italic" style={{ ...display, color: C.muted }}>Long live your favourites.</p>

          {sent ? (
            <p className="text-sm" style={{ color: C.muted }}>Check your email for a sign-in link.</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <input
                type="email"
                required
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
              />
              {error && <p className="text-xs" style={{ color: C.coup }}>{error}</p>}
              <button type="submit" disabled={submitting} className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold" style={{ background: C.gold, color: C.bg }}>
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Crown size={15} />}
                {submitting ? "Sending..." : "Send sign-in link"}
              </button>
            </form>
          )}
        </div>
      </div>
    </FontShell>
  );
}

function PlaceModal({ mode, cuisineId, cuisineName, cuisines, prefill, reigning, defaultCity, onClose, onSubmit }) {
  const isCoup = mode === "coup"; const isPretender = mode === "pretender";
  const [cz, setCz] = useState(cuisineId);
  const [query, setQuery] = useState(prefill?.name || "");
  const [city, setCity] = useState(defaultCity || "Toronto");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(prefill?.mapsUrl ? prefill : null);
  const [name, setName] = useState(prefill?.name || "");
  const [area, setArea] = useState(prefill?.area || "");
  const [text, setText] = useState("");
  const minLen = isPretender ? 0 : MIN_DECREE_LENGTH;
  const valid = name.trim().length > 1 && text.trim().length >= minLen && !!cz;
  const czName = cuisines.find((c) => c.id === cz)?.name || cuisineName;

  const find = async () => {
    if (!query.trim() || searching) return;
    setSearching(true); setErr(""); setResults([]); setSel(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ mode: "lookup", query: query.trim(), city: city.trim() || "Toronto" }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("The lookup didn't finish properly. Try again.");
      }
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      if (Array.isArray(data.results) && data.results.length) setResults(data.results.slice(0, 3));
      else setErr("No matches found. Fill in the details manually below.");
    } catch (e) {
      setErr(e.message || "Lookup didn't work. Fill in the details manually below.");
    }
    setSearching(false);
  };

  const choose = (r) => { setSel(r); setName(r.name || ""); setArea(r.neighbourhood || ""); setResults([]); };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div className="max-h-screen w-full max-w-md overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>
            {isPretender ? "Add to Next in Line" : isCoup ? `Stage a coup · ${czName}` : `Crown your ${czName} spot`}
          </h3>
          <button onClick={onClose} aria-label="Close" style={{ color: C.muted }}><X size={18} /></button>
        </div>

        {isCoup && reigning && (
          <p className="mt-2 rounded-lg p-2.5 text-xs" style={{ background: C.bg, color: C.muted, border: `1px solid ${C.cardEdge}` }}>
            <Crown size={11} className="mr-1 inline" style={{ color: C.gold }} />{reigning.name} holds this throne. Your decree must say why the new spot takes it.
          </p>)}

        {(isPretender || prefill) && (<div className="mt-3">
          <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Cuisine</label>
          <select value={cz} onChange={(e) => setCz(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}>
            {cuisines.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>)}

        <div className="mt-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Find the real place</div>
          <div className="mt-2 flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} placeholder="Restaurant name" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="w-24 rounded-lg px-2 py-2.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
          </div>
          <button onClick={find} disabled={searching || !query.trim()} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold" style={searching || !query.trim() ? { background: C.cardEdge, color: C.muted } : { background: C.gold, color: C.bg }}>
            {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}{searching ? "Searching the realm..." : "Look it up"}
          </button>
          {err && <p className="mt-2 text-xs" style={{ color: C.coup }}>{err}</p>}
          {results.map((r, i) => (
            <button key={i} onClick={() => choose(r)} className="mt-2 w-full rounded-lg p-2.5 text-left" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
              <div className="flex items-center justify-between"><span className="text-sm font-bold">{r.name}</span>
                {r.rating && <span className="flex items-center gap-0.5 text-xs" style={{ color: C.gold }}><Star size={11} fill={C.gold} /> {r.rating}</span>}</div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>{[r.neighbourhood, r.address].filter(Boolean).join(" · ")}</div>
            </button>))}
          {sel && (<div className="mt-2 flex items-start justify-between rounded-lg p-2.5" style={{ border: `1px solid ${C.green}66`, background: C.green + "11" }}>
            <div><div className="text-sm font-bold" style={{ color: C.green }}>{sel.name}</div>
              <div className="text-xs" style={{ color: C.muted }}>{[sel.neighbourhood || sel.area, sel.address].filter(Boolean).join(" · ")}</div></div>
            {sel.mapsUrl && <a href={sel.mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-xs font-semibold" style={{ color: C.green }}>Map <ExternalLink size={10} /></a>}
          </div>)}
        </div>

        <input value={name} onChange={(e) => { setName(e.target.value); if (sel && e.target.value !== sel.name) setSel(null); }} placeholder="Restaurant name" className="mt-3 w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
        <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Neighbourhood (optional)" className="mt-2 w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={isPretender ? 2 : 4}
          placeholder={isPretender ? "Why do you want to go? (optional)" : isCoup ? "The decree: why does this dethrone the reigning spot?" : "The decree: what makes this your one true spot?"}
          className="mt-2 w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
        {!isPretender && (<div className="mt-1 text-right text-xs" style={{ color: text.trim().length >= minLen ? C.green : C.muted }}>
          {text.trim().length}/{minLen} minimum. No throne without a decree.
        </div>)}

        <button disabled={!valid} onClick={() => onSubmit(cz, { name: name.trim(), area: area.trim(), ...(isPretender ? { note: text.trim() } : { decree: text.trim() }), address: sel?.address || "", rating: sel?.rating || "", mapsUrl: sel?.mapsUrl || "" })}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold"
          style={valid ? { background: isCoup ? C.coup : C.gold, color: isCoup ? C.cream : C.bg } : { background: C.cardEdge, color: C.muted }}>
          {isPretender ? <Bookmark size={15} /> : isCoup ? <Swords size={15} /> : <Crown size={15} />}
          {isPretender ? "Add to Next in Line" : isCoup ? "Dethrone and crown" : "Crown this spot"}
        </button>
      </div>
    </div>);
}

function ImportModal({ cuisineNames, onClose, onImport }) {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState(null);
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState("");

  const parse = async () => {
    if (!raw.trim() || working) return;
    setWorking(true); setErr("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ mode: "import", raw: raw.trim().slice(0, 8000), cuisines: cuisineNames }),
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("The import didn't finish properly. Try again.");
      }
      if (!res.ok) throw new Error(data.error || "Import failed");
      if (!Array.isArray(data.results) || !data.results.length) {
        setErr("Couldn't find any restaurants in that. Try pasting one per line.");
      } else {
        setRows(data.results.map((r, i) => ({ ...r, _id: i, _keep: true })));
      }
    } catch (e) {
      setErr(e.message || "Couldn't read that list. Try pasting it again, one restaurant per line.");
    }
    setWorking(false);
  };

  const update = (id, field, val) => setRows((p) => p.map((r) => (r._id === id ? { ...r, [field]: val } : r)));
  const keeping = rows ? rows.filter((r) => r._keep) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div className="max-h-screen w-full max-w-md overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>Import your list</h3>
          <button onClick={onClose} aria-label="Close" style={{ color: C.muted }}><X size={18} /></button>
        </div>

        {!rows ? (<>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>
            Paste it in however it comes. Notes, a CSV, a screenshot&apos;s worth of text, a rambling list from the group chat. It&apos;ll sort out the mess.
          </p>
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={8} maxLength={8000}
            placeholder={"Bar Prima - pizza, Little Italy, best margherita\nPai (thai) khao soi!!\nKinton Ramen, Annex\nsunny's chinese - kensington, cumin lamb"}
            className="mt-3 w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
          <div className="mt-1 text-right text-xs" style={{ color: C.muted }}>{raw.length}/8000</div>
          {err && <p className="mt-1 text-xs" style={{ color: C.coup }}>{err}</p>}
          <button onClick={parse} disabled={working || !raw.trim()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold"
            style={working || !raw.trim() ? { background: C.cardEdge, color: C.muted } : { background: C.gold, color: C.bg }}>
            {working ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {working ? "Reading your list..." : "Sort this out"}
          </button>
          <p className="mt-2 text-center text-xs" style={{ color: C.muted }}>
            Everything lands in Next in Line. Thrones still have to be earned one decree at a time.
          </p>
        </>) : (<>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>Found {rows.length}. Check the cuisines, untick anything you don&apos;t want.</p>
          <div className="mt-3">
            {rows.map((r) => (
              <div key={r._id} className="mb-2 rounded-lg p-2.5" style={{ background: C.bg, border: `1px solid ${r._keep ? C.cardEdge : C.cardEdge + "55"}`, opacity: r._keep ? 1 : 0.45 }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">{r.name}</span>
                  <button onClick={() => update(r._id, "_keep", !r._keep)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                    style={r._keep ? { background: C.gold, color: C.bg } : { border: `1px solid ${C.cardEdge}` }}>
                    {r._keep && <Check size={12} strokeWidth={3} />}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <select value={r.cuisine} onChange={(e) => update(r._id, "cuisine", e.target.value)} className="rounded px-2 py-1 text-xs outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }}>
                    {[...new Set([r.cuisine, ...cuisineNames].filter(Boolean))].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {r.area && <span className="text-xs" style={{ color: C.muted }}>{r.area}</span>}
                </div>
                {r.note && <p className="mt-1 text-xs italic" style={{ color: C.muted }}>{r.note}</p>}
              </div>))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setRows(null)} className="rounded-lg px-4 py-3 text-sm font-bold" style={{ border: `1px solid ${C.cardEdge}`, color: C.muted }}>Back</button>
            <button disabled={!keeping.length} onClick={() => onImport(keeping.map(({ _id, _keep, ...r }) => r))}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold"
              style={keeping.length ? { background: C.gold, color: C.bg } : { background: C.cardEdge, color: C.muted }}>
              <Bookmark size={15} /> Add {keeping.length} to Next in Line
            </button>
          </div>
        </>)}
      </div>
    </div>);
}
