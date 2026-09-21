"use client";

import { useState, useEffect } from "react";
import {
  Crown, Plus, ScrollText, Swords, X, Users, ChevronDown, ChevronUp,
  MapPin, Search, Star, ExternalLink, Loader2, Bookmark, Share2, Check, Trash2,
  ClipboardPaste, Wand2, LogOut, UserPlus, Pencil, RotateCcw, Globe, Lock,
  MessageSquare, Bell,
} from "lucide-react";
import {
  supabase, getUser, onAuthChange, signIn, verifyCode, signInWithGoogle, signOut, getProfile, updateProfile, deleteAccount, submitFeedback,
  loadDirectory, loadFollowers, followUser, loadNotifications, markNotificationsSeen,
  loadKingdom, loadNextInLine, loadCuisines, addCuisine,
  crownSpot, promoteToThrone, addToNextInLine, importToNextInLine, removeFromNextInLine, markVisited, updatePretenderCuisine, updatePretenderNote,
  moveThroneCuisine, unCrown,
  loadCourt, toggleEndorsement, followByUsername, loadStanding,
} from "@/lib/data";
import { C, display, body, RANKS, getRank, getTitle, RankBadge, OwnerBadge, LogoMark, FontShell } from "./theme";

const MIN_DECREE_LENGTH = 30;
const MAX_IMPORT_CHARS = 20000;

// A reserved, shared cuisine row (seeded in schema.sql) that every user gets
// their own throne on via the normal unique(user_id, cuisine_id) constraint.
// Reusing the cuisine/throne machinery for this means the overall favourite
// gets crowning, coups and history for free, with no separate table.
const OVERALL_FAVOURITE_NAME = "Overall Favourite";

// Import-extracted names can carry stray formatting a canonical, looked-up
// name won't ("Writers room -" vs "Writers room"), so an exact string match
// misses obvious duplicates. Strip trailing separator punctuation and
// collapse whitespace before comparing.
const normalizeName = (name) =>
  name
    .toLowerCase()
    .trim()
    .replace(/[\s\-–—:,.]+$/, "")
    .replace(/\s+/g, " ");

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
  const [followers, setFollowers] = useState([]);
  const [followBackBusy, setFollowBackBusy] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [hasUnseenNotifications, setHasUnseenNotifications] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");

  const [modal, setModal] = useState(null);
  const [addPretender, setAddPretender] = useState(false);
  const [importing, setImporting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState({});
  const [courtOpen, setCourtOpen] = useState({});
  const [newCuisine, setNewCuisine] = useState("");
  const [addingCuisine, setAddingCuisine] = useState(false);
  const [onlyCrowned, setOnlyCrowned] = useState(false);
  const [pretenderSearch, setPretenderSearch] = useState("");
  const [toast, setToast] = useState("");

  const [followInput, setFollowInput] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState("");

  const [editingProfile, setEditingProfile] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  useEffect(() => {
    getUser().then((u) => { setUser(u); setAuthChecked(true); });
    return onAuthChange((u) => setUser(u));
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [k, n, c, s, crt, flw, p] = await Promise.all([
          loadKingdom(user.id),
          loadNextInLine(user.id),
          loadCuisines(user.id),
          loadStanding(user.id),
          loadCourt(user.id),
          loadFollowers(user.id),
          getProfile(user.id),
        ]);
        setSlots(k); setPretenders(n); setCuisineList(c);
        setStanding(s); setCourt(crt); setFollowers(flw); setProfile(p);
        const notifs = await loadNotifications(user.id, p.notifications_seen_at);
        setNotifications(notifs);
        setHasUnseenNotifications(notifs.length > 0);
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
  const refreshFollowers = async () => setFollowers(await loadFollowers(user.id));

  const handleFollowBack = async (targetId) => {
    setFollowBackBusy(targetId);
    try {
      await followUser(user.id, targetId);
      await Promise.all([refreshFollowers(), refreshCourt()]);
    } catch (e) {
      flash(e.message || "Couldn't follow back");
    }
    setFollowBackBusy(null);
  };

  const handleFollowFromDirectory = async (targetId) => {
    await followUser(user.id, targetId);
    await refreshCourt();
  };

  const overallCuisine = cuisineList.find((c) => c.is_default && c.name === OVERALL_FAVOURITE_NAME);
  // Defends against a name collision between a shared default and someone's
  // pre-existing custom cuisine of the same name (exactly what happened
  // when new defaults were added and retroactively collided with a custom
  // one - both rows are legitimate, but showing both as separate cards with
  // the same name broke rendering). Keeps the first match per name; since
  // loadCuisines sorts defaults before customs, that's always the default.
  const seenNames = new Map();
  for (const c of cuisineList) {
    if (c === overallCuisine) continue;
    const key = c.name.toLowerCase();
    if (!seenNames.has(key)) seenNames.set(key, c);
  }
  // loadCuisines sorts defaults before customs as two separate alphabetical
  // blocks (needed there so the dedup above prefers the default), not one
  // unified A-Z order - re-sort here so the list actually reads A-Z
  // regardless of default/custom status, since that's what both the
  // Kingdom cards and the Next in Line cuisine dropdowns display in.
  const selectableCuisines = Array.from(seenNames.values()).sort((a, b) => a.name.localeCompare(b.name));
  const cuisineNames = selectableCuisines.map((c) => c.name);

  const crown = async (cuisineId, entry, fromPretenderId) => {
    const cuisineName = cuisineList.find((c) => c.id === cuisineId)?.name || "";
    await promoteToThrone(user.id, cuisineId, entry, fromPretenderId);
    await refreshKingdom();
    if (fromPretenderId) await refreshPretenders();
    await refreshStanding();
    setModal(null);
    flash(fromPretenderId ? `${entry.name} promoted to the ${cuisineName} throne` : `${entry.name} crowned`);
  };

  const handleMoveCuisine = async (throneId, newCuisineId) => {
    await moveThroneCuisine(throneId, newCuisineId);
    await refreshKingdom();
  };

  const handleUnCrown = async (cuisineId, throne) => {
    await unCrown(user.id, throne.id, {
      name: throne.name,
      area: throne.area,
      address: throne.address,
      rating: throne.rating,
      mapsUrl: throne.mapsUrl,
      cuisineId,
    });
    await refreshKingdom();
    await refreshPretenders();
    await refreshStanding();
    flash(`${throne.name} un-crowned, back in Next in Line`);
  };

  const addToPretenders = async (cuisineId, entry) => {
    if (pretenders.some((p) => normalizeName(p.name) === normalizeName(entry.name))) {
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

  const handleChangePretenderCuisine = async (id, cuisineId) => {
    await updatePretenderCuisine(id, cuisineId || null);
    await refreshPretenders();
  };

  const handleChangePretenderNote = async (id, note) => {
    await updatePretenderNote(id, note);
    await refreshPretenders();
  };

  const handleToggleVisited = async (id, currentlyVisited, cuisineId) => {
    if (!currentlyVisited && !cuisineId) {
      flash("Pick a cuisine below first");
      return;
    }
    await markVisited(id, !currentlyVisited);
    await refreshPretenders();
  };

  // Bulk import: resolve each row's cuisine name to an existing id, or
  // create it. Sequential on purpose - two rows guessing the same brand
  // new cuisine must not both try to create it.
  const importMany = async (rows) => {
    let added = 0, skipped = 0;
    const existingNames = new Set(pretenders.map((p) => normalizeName(p.name)));
    let localCuisines = cuisineList;
    const resolved = [];
    for (const r of rows) {
      const key = normalizeName(r.name);
      if (existingNames.has(key)) { skipped++; continue; }
      existingNames.add(key);
      let match = localCuisines.find(
        (c) => !(c.is_default && c.name === OVERALL_FAVOURITE_NAME) &&
          c.name.toLowerCase() === (r.cuisine || "").toLowerCase().trim()
      );
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
    if (v.toLowerCase() === OVERALL_FAVOURITE_NAME.toLowerCase()) {
      flash("That name is reserved");
      setNewCuisine(""); setAddingCuisine(false);
      return;
    }
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

  const handleUpdateProfile = async (fields) => {
    const updated = await updateProfile(user.id, fields);
    setProfile(updated);
  };

  const handleDeleteAccount = async () => {
    await deleteAccount();
    await signOut();
  };

  const handleSubmitFeedback = async (message) => {
    await submitFeedback(user.id, message, tab);
  };

  const handleOpenNotifications = () => {
    setShowNotifications((v) => !v);
    if (hasUnseenNotifications) {
      setHasUnseenNotifications(false);
      markNotificationsSeen(user.id).catch(() => {});
    }
  };

  // Worded as where the idea came from, not an ongoing claim about their
  // opinion - this note has no live link back to the friend's throne, so
  // "swears by this one" would age into a false statement the moment they
  // change their mind.
  const addFriendPickToPretenders = (friendName, pick) =>
    addToPretenders(pick.cuisineId, {
      name: pick.name,
      area: pick.area,
      note: `Added from ${friendName}'s picks.`,
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
  const visitedCount = pretenders.filter((p) => p.visitedAt).length;
  const reviewCount = pretenders.filter((p) => p.visitedAt && p.note).length;
  const unvisitedCount = pretenders.length - visitedCount;
  const score = standing?.score ?? 0;
  const rank = getRank(score);
  const title = getTitle(profile?.is_owner, score);
  const nextRank = RANKS.find((r) => r.min > score);
  const fmt = (t) => new Date(t).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
  const shown = onlyCrowned ? cuisineNames.filter((c) => slots[c]?.current) : cuisineNames;

  const pretenderQuery = pretenderSearch.trim().toLowerCase();
  const filteredPretenders = pretenderQuery
    ? pretenders.filter((p) =>
        [p.name, p.cuisine, p.area, p.note].some((f) => f && f.toLowerCase().includes(pretenderQuery))
      )
    : pretenders;
  const sortByName = (a, b) => a.name.localeCompare(b.name);
  const stillToTry = filteredPretenders.filter((p) => !p.visitedAt).sort(sortByName);
  const beenTo = filteredPretenders.filter((p) => p.visitedAt).sort(sortByName);

  return (
    <FontShell>
      <header className="px-5 pt-7 pb-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <LogoMark size={32} />
          <h1 className="text-3xl tracking-[0.12em]" style={{ ...display, fontWeight: 900 }}>NOMARCHY</h1>
        </div>
        <p className="mt-1 text-sm italic" style={{ ...display, color: C.muted }}>Long live your favourites.</p>
        <div className="mt-2 flex items-center justify-center">
          <div
            className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: C.card, color: C.muted, border: `1px solid ${C.cardEdge}` }}
          >
            <button onClick={() => setEditingProfile(true)} className="flex items-center gap-1">
              @{profile?.username} · {title} <RankBadge score={score} /> {profile?.is_owner && <OwnerBadge />} <Pencil size={11} />
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
          <span className="relative">
            <button
              onClick={handleOpenNotifications}
              aria-label="Notifications"
              className="flex h-7 w-7 items-center justify-center rounded-full"
              style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}
            >
              <Bell size={13} />
              {hasUnseenNotifications && (
                <span className="absolute right-0 top-0 h-2 w-2 rounded-full" style={{ background: C.coup }} />
              )}
            </button>
            {showNotifications && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                <div
                  className="absolute left-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2.5rem)] rounded-xl p-3 text-left"
                  onClick={(e) => e.stopPropagation()}
                  style={{ background: C.card, border: `1px solid ${C.cardEdge}`, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
                >
                  <div className="mb-1.5 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Notifications</div>
                  {notifications.length === 0 ? (
                    <p className="text-xs" style={{ color: C.muted }}>Nothing new.</p>
                  ) : notifications.map((n, i) => (
                    <div key={i} className="py-1.5 text-xs" style={{ borderTop: i > 0 ? `1px solid ${C.cardEdge}` : "none", color: C.cream }}>
                      {n.type === "follow"
                        ? <><span style={{ fontWeight: 700 }}>{n.name}</span> started following you</>
                        : <><span style={{ fontWeight: 700 }}>{n.name}</span> crowned <span style={{ color: C.gold }}>{n.place}</span> for {n.cuisine}</>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </span>
          <button onClick={() => setShowMembers(true)} aria-label="Find people" className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold sm:px-3" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}>
            <Users size={12} /> <span className="hidden sm:inline">Find people</span>
          </button>
          <button onClick={() => setShowFeedback(true)} aria-label="Feedback" className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold sm:px-3" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}>
            <MessageSquare size={12} /> <span className="hidden sm:inline">Feedback</span>
          </button>
          <button onClick={signOut} aria-label="Sign out" className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold sm:px-3" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}>
            <LogOut size={12} /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {loadError && (
        <div className="mx-auto mb-4 max-w-2xl rounded-lg px-4 py-2 text-center text-sm" style={{ background: C.coup + "18", color: C.coup }}>
          {loadError}
        </div>
      )}

      <nav className="flex flex-wrap justify-center gap-2 px-4 pb-5">
        {[{ id: "kingdom", label: "Kingdom", icon: Crown }, { id: "pretenders", label: "Next in Line", icon: Bookmark }, { id: "court", label: "Court", icon: Users }].map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
            style={tab === id ? { background: C.gold, color: C.bg } : { background: C.card, color: C.muted, border: `1px solid ${C.cardEdge}` }}>
            <Icon size={15} strokeWidth={2.2} />{label}
            {id === "pretenders" && unvisitedCount > 0 && <span className="rounded-full px-1.5 text-xs" style={{ background: tab === id ? C.bg : C.cardEdge, color: tab === id ? C.gold : C.cream }}>{unvisitedCount}</span>}
          </button>
        ))}
      </nav>

      <main className="mx-auto max-w-2xl px-5 pb-28">
        {!loaded ? (
          <p className="text-center text-sm" style={{ color: C.muted }}>Loading your kingdom...</p>
        ) : (<>
        {/* KINGDOM */}
        {tab === "kingdom" && (<div>
          {overallCuisine && (
            <div className="mb-4">
              <ThroneCard
                featured
                cuisineName={OVERALL_FAVOURITE_NAME}
                cuisineId={overallCuisine.id}
                slot={slots[OVERALL_FAVOURITE_NAME]}
                historyOpen={historyOpen}
                setHistoryOpen={setHistoryOpen}
                setModal={setModal}
                sharePick={sharePick}
                fmt={fmt}
                onUnCrown={() => handleUnCrown(overallCuisine.id, slots[OVERALL_FAVOURITE_NAME]?.current)}
              />
            </div>
          )}

          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm" style={{ color: C.muted }}>One throne per cuisine. Choose like it matters.</p>
            <button onClick={() => setOnlyCrowned(!onlyCrowned)} className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: onlyCrowned ? C.gold : C.card, color: onlyCrowned ? C.bg : C.muted, border: `1px solid ${C.cardEdge}` }}>
              {onlyCrowned ? "Showing crowned" : "Show all"}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shown.map((cuisineName) => {
              const thisId = selectableCuisines.find((c) => c.name === cuisineName)?.id;
              return (
                <ThroneCard
                  key={cuisineName}
                  cuisineName={cuisineName}
                  cuisineId={thisId}
                  slot={slots[cuisineName]}
                  historyOpen={historyOpen}
                  setHistoryOpen={setHistoryOpen}
                  setModal={setModal}
                  sharePick={sharePick}
                  fmt={fmt}
                  emptyCuisines={selectableCuisines.filter((c) => c.id !== thisId && !slots[c.name]?.current)}
                  onMoveCuisine={(newCuisineId) => handleMoveCuisine(slots[cuisineName]?.current?.id, newCuisineId)}
                  onUnCrown={() => handleUnCrown(thisId, slots[cuisineName]?.current)}
                />
              );
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
          <div className="mb-3 flex gap-2">
            <button onClick={() => setAddPretender(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold" style={{ background: C.gold, color: C.bg }}><Plus size={16} /> Add a place</button>
            <button onClick={() => setImporting(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold" style={{ border: `1px solid ${C.gold}66`, color: C.gold }}><ClipboardPaste size={16} /> Import a list</button>
          </div>

          {pretenders.length > 0 && (
            <div className="relative mb-4">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
              <input
                value={pretenderSearch}
                onChange={(e) => setPretenderSearch(e.target.value)}
                placeholder="Search your list..."
                className="w-full rounded-lg py-2.5 pl-9 pr-3 text-sm outline-none"
                style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }}
              />
            </div>
          )}

          {pretenders.length === 0 ? (
            <div className="rounded-xl p-6 text-center" style={{ background: C.card, border: `1px dashed ${C.cardEdge}` }}>
              <Bookmark size={26} className="mx-auto" style={{ color: C.muted }} />
              <p className="mt-2 text-sm" style={{ color: C.muted }}>Nothing waiting in throne just yet. Add the places you keep meaning to try, then promote the good ones.</p>
              <p className="mt-2 text-sm" style={{ color: C.muted }}>Already got a list in Notes or a spreadsheet? Paste the whole thing into Import and it&apos;ll sort it out.</p>
            </div>
          ) : stillToTry.length === 0 && beenTo.length === 0 ? (
            <div className="rounded-xl p-6 text-center" style={{ background: C.card, border: `1px dashed ${C.cardEdge}` }}>
              <p className="text-sm" style={{ color: C.muted }}>Nothing matches &ldquo;{pretenderSearch}&rdquo;.</p>
            </div>
          ) : (<>
            {stillToTry.length > 0 && (<>
              <h3 className="mb-2 text-xs font-bold uppercase" style={{ color: C.gold, letterSpacing: "0.14em" }}>Still to try</h3>
              {stillToTry.map((p) => (
                <PretenderCard key={p.id} p={p} selectableCuisines={selectableCuisines}
                  onRemove={handleRemovePretender} onChangeNote={handleChangePretenderNote}
                  onChangeCuisine={handleChangePretenderCuisine} onToggleVisited={handleToggleVisited}
                  onCrown={(prefill) => setModal({
                    cuisineId: prefill.cuisineId || "",
                    cuisineName: prefill.cuisine || "",
                    mode: prefill.cuisine && slots[prefill.cuisine]?.current ? "coup" : "claim",
                    prefill,
                    pretenderId: prefill.id,
                  })}
                />
              ))}
            </>)}
            {beenTo.length > 0 && (<>
              <h3 className="mb-2 mt-5 text-xs font-bold uppercase" style={{ color: C.gold, letterSpacing: "0.14em" }}>Been to</h3>
              {beenTo.map((p) => (
                <PretenderCard key={p.id} p={p} selectableCuisines={selectableCuisines}
                  onRemove={handleRemovePretender} onChangeNote={handleChangePretenderNote}
                  onChangeCuisine={handleChangePretenderCuisine} onToggleVisited={handleToggleVisited}
                  onCrown={(prefill) => setModal({
                    cuisineId: prefill.cuisineId || "",
                    cuisineName: prefill.cuisine || "",
                    mode: prefill.cuisine && slots[prefill.cuisine]?.current ? "coup" : "claim",
                    prefill,
                    pretenderId: prefill.id,
                  })}
                />
              ))}
            </>)}
          </>)}
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

          {followers.some((f) => !f.alreadyFollowing) && (
            <div className="mb-4 rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
              <div className="mb-2 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Following you</div>
              {followers.filter((f) => !f.alreadyFollowing).map((f) => (
                <div key={f.id} className="flex items-center justify-between py-1.5">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {f.name} {f.isOwner && <OwnerBadge size={12} />}
                  </span>
                  <button
                    onClick={() => handleFollowBack(f.id)}
                    disabled={followBackBusy === f.id}
                    className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
                    style={{ background: C.gold, color: C.bg }}
                  >
                    {followBackBusy === f.id ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
                    Follow back
                  </button>
                </div>
              ))}
            </div>
          )}

          {court.length === 0 ? (
            <div className="rounded-xl p-6 text-center" style={{ background: C.card, border: `1px dashed ${C.cardEdge}` }}>
              <Users size={26} className="mx-auto" style={{ color: C.muted }} />
              <p className="mt-2 text-sm" style={{ color: C.muted }}>Nobody in your court yet. Follow a friend by username above, and share yours (@{profile?.username}) so they can follow you back.</p>
            </div>
          ) : court.map((f) => {
            const open = !!courtOpen[f.id];
            return (
            <div key={f.id} className="mb-4 rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
              <button
                onClick={() => setCourtOpen((p) => ({ ...p, [f.id]: !p[f.id] }))}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <div>
                  <h3 className="flex items-center gap-1.5 text-lg" style={{ ...display, fontWeight: 700 }}>
                    {f.name} <RankBadge score={f.score} /> {f.isOwner && <OwnerBadge />}
                  </h3>
                  <span
                    className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{ background: C.bg, color: C.gold, letterSpacing: "0.06em" }}
                  >
                    {getTitle(f.isOwner, f.score)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-xs font-semibold" style={{ color: C.gold }}>{f.score}</span>
                  {open ? <ChevronUp size={16} style={{ color: C.muted }} /> : <ChevronDown size={16} style={{ color: C.muted }} />}
                </div>
              </button>
              {!open && (
                <p className="mt-1.5 text-xs" style={{ color: C.muted }}>
                  {f.picks.length === 0 && f.reviews.length === 0
                    ? "No thrones claimed yet."
                    : [
                        f.picks.length ? `${f.picks.length} pick${f.picks.length === 1 ? "" : "s"}` : null,
                        f.reviews.length ? `${f.reviews.length} review${f.reviews.length === 1 ? "" : "s"}` : null,
                      ].filter(Boolean).join(", ") + " - tap to view"}
                </p>
              )}
              {open && f.picks.length === 0 && f.reviews.length === 0 && <p className="mt-2 text-xs" style={{ color: C.muted }}>No thrones claimed yet.</p>}
              {open && f.picks.map((p) => (
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
              {open && f.reviews.length > 0 && (
                <div className="mt-3 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Been to, not crowned</div>
              )}
              {open && f.reviews.map((r) => (
                <div key={r.id} className="mt-2 rounded-lg p-3" style={{ background: C.bg, border: `1px dashed ${C.cardEdge}` }}>
                  <div className="flex items-center justify-between gap-2">
                    <span style={{ ...display, fontWeight: 700 }} className="text-sm">{r.name}</span>
                    <span className="text-xs" style={{ color: C.muted }}>{[r.cuisine, r.area].filter(Boolean).join(" · ")}</span>
                  </div>
                  {r.note && <p className="mt-1 text-sm italic leading-relaxed" style={{ color: C.cream + "CC" }}>&ldquo;{r.note}&rdquo;</p>}
                </div>))}
            </div>
            );
          })}
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
          cuisines={selectableCuisines}
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

      {addPretender && selectableCuisines.length > 0 && (
        <PlaceModal
          mode="pretender"
          cuisineId={selectableCuisines[0]?.id}
          cuisineName={selectableCuisines[0]?.name}
          cuisines={selectableCuisines}
          defaultCity={profile?.city || "Toronto"}
          onClose={() => setAddPretender(false)}
          onSubmit={(cid, entry) => addToPretenders(cid, entry)}
        />
      )}

      {editingProfile && (
        <ProfileModal
          profile={profile}
          title={title}
          rank={rank}
          nextRank={nextRank}
          score={score}
          stats={[
            { n: thrones, label: "Thrones claimed", hint: "Crown more cuisines" },
            { n: coups, label: "Coups staged", hint: "Better spots dethrone old ones" },
            { n: pretenders.length, label: "Next in line", hint: "Go try them" },
            { n: endorseCount, label: "Endorsements given", hint: "Crown your friends' picks" },
            { n: thrones + visitedCount, label: "Restaurants been to", hint: "Crowned, plus marked as been" },
            { n: reviewCount, label: "Reviews written", hint: "Visible to friends who follow you" },
          ]}
          onClose={() => setEditingProfile(false)}
          onSubmit={handleUpdateProfile}
          onDeleteAccount={handleDeleteAccount}
        />
      )}

      {showFeedback && (
        <FeedbackModal
          onClose={() => setShowFeedback(false)}
          onSubmit={handleSubmitFeedback}
        />
      )}

      {showMembers && (
        <MembersModal userId={user.id} onFollow={handleFollowFromDirectory} onClose={() => setShowMembers(false)} />
      )}
    </FontShell>
  );
}

function RankLadder({ score }) {
  const rank = getRank(score);
  return (
    <div className="rounded-xl p-4 text-left" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
      <div className="mb-1 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.14em" }}>The ladder</div>
      {[...RANKS].reverse().map((r, i) => {
        const reached = score >= r.min;
        const isCurrent = r.title === rank.title;
        return (
          <div key={r.title} className="flex items-center justify-between py-1.5"
            style={{ borderTop: i > 0 ? `1px solid ${C.cardEdge}` : "none" }}>
            <div className="flex items-center gap-2">
              <Crown size={13} style={{ color: reached ? C.gold : C.muted }} fill={reached ? C.gold : "none"} strokeWidth={reached ? 0 : 2} />
              <span className="text-sm" style={{ color: isCurrent ? C.gold : reached ? C.cream : C.muted, fontWeight: isCurrent ? 700 : 500 }}>
                {r.title}
              </span>
              {isCurrent && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: C.gold, color: C.bg, letterSpacing: "0.06em" }}>
                  You are here
                </span>
              )}
            </div>
            <span className="text-xs" style={{ color: C.muted }}>{r.min}</span>
          </div>
        );
      })}
    </div>
  );
}

function PretenderCard({ p, selectableCuisines, onRemove, onChangeNote, onChangeCuisine, onToggleVisited, onCrown }) {
  return (
    <div className="mb-3 rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, opacity: p.visitedAt ? 0.7 : 1 }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-lg" style={{ ...display, fontWeight: 700 }}>
            {p.name}
            {p.visitedAt && <Check size={14} style={{ color: C.green }} />}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs" style={{ color: C.muted }}>
            {(p.area || p.address) && <><MapPin size={11} /> {p.area || p.address}</>}
            {p.rating && <><Star size={11} style={{ color: C.gold }} fill={C.gold} /> {p.rating}</>}
            {p.mapsUrl && <a href={p.mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 font-semibold" style={{ color: C.gold }}>Map <ExternalLink size={10} /></a>}
          </div>
        </div>
        <button onClick={() => onRemove(p.id)} aria-label="Remove" style={{ color: C.muted }}><Trash2 size={15} /></button>
      </div>
      <textarea
        key={p.id + (p.note || "")}
        defaultValue={p.note || ""}
        onBlur={(e) => { if (e.target.value !== (p.note || "")) onChangeNote(p.id, e.target.value.trim()); }}
        placeholder={p.visitedAt ? "Write a review - visible to friends who follow you" : "Note (optional, private until you've been)"}
        rows={2}
        className="mt-2 w-full rounded-lg px-3 py-2 text-sm italic outline-none"
        style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
      />
      <select
        value={p.cuisineId || ""}
        onChange={(e) => onChangeCuisine(p.id, e.target.value)}
        className="mt-2 rounded px-2 py-1 text-xs outline-none"
        style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: p.cuisineId ? C.cream : C.muted }}
      >
        <option value="">Uncategorized</option>
        {selectableCuisines.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => onCrown(p)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.gold, color: C.bg }}>
          <Crown size={13} /> Crown it
        </button>
        <button
          onClick={() => onToggleVisited(p.id, !!p.visitedAt, p.cuisineId)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
          style={p.visitedAt ? { background: C.green + "22", color: C.green, border: `1px solid ${C.green}66` } : { color: C.muted, border: `1px solid ${C.cardEdge}` }}>
          <Check size={13} /> {p.visitedAt ? "Been here" : "Mark as been"}
        </button>
      </div>
    </div>
  );
}

function ThroneCard({ cuisineName, cuisineId, slot, featured, historyOpen, setHistoryOpen, setModal, sharePick, fmt, emptyCuisines, onMoveCuisine, onUnCrown }) {
  const r = slot?.current;
  const fallenList = slot?.fallen || [];
  const open = historyOpen[cuisineName];

  const [changingCuisine, setChangingCuisine] = useState(false);
  const [targetCuisineId, setTargetCuisineId] = useState("");
  const [moving, setMoving] = useState(false);
  const [moveErr, setMoveErr] = useState("");

  const confirmMove = async () => {
    if (!targetCuisineId || moving) return;
    setMoving(true); setMoveErr("");
    try {
      await onMoveCuisine(targetCuisineId);
      setChangingCuisine(false);
      setTargetCuisineId("");
    } catch (e) {
      setMoveErr(e.message || "Couldn't move it.");
    }
    setMoving(false);
  };

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: C.card,
        border: `${featured ? 2 : 1}px solid ${r ? C.gold + "55" : C.cardEdge}`,
        boxShadow: featured ? `0 0 0 1px ${C.gold}33` : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.14em" }}>{cuisineName}</span>
        {r && <Crown size={16} style={{ color: C.gold }} fill={C.gold} strokeWidth={0} />}
      </div>
      {r ? (<div className="mt-2">
        <h3 className={featured ? "text-2xl" : "text-xl"} style={{ ...display, fontWeight: 700 }}>{r.name}</h3>
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
          {onMoveCuisine && (
            <button onClick={() => setChangingCuisine((v) => !v)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}><Pencil size={13} /> Wrong category?</button>
          )}
          {onUnCrown && (
            <button onClick={onUnCrown} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}><RotateCcw size={13} /> Un-crown</button>
          )}
          {fallenList.length > 0 && <button onClick={() => setHistoryOpen((p) => ({ ...p, [cuisineName]: !p[cuisineName] }))} className="flex items-center gap-1 px-1 text-xs font-semibold" style={{ color: C.muted }}>{fallenList.length} fallen {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>}
        </div>
        {changingCuisine && (
          <div className="mt-2 rounded-lg p-2.5" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
            <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Move to</label>
            <select value={targetCuisineId} onChange={(e) => setTargetCuisineId(e.target.value)} className="mt-1 w-full rounded-lg px-2 py-1.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }}>
              <option value="">Choose a cuisine...</option>
              {(emptyCuisines || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {(emptyCuisines || []).length === 0 && <p className="mt-1 text-xs" style={{ color: C.muted }}>Every other cuisine already has a ruler.</p>}
            {moveErr && <p className="mt-1 text-xs" style={{ color: C.coup }}>{moveErr}</p>}
            <div className="mt-2 flex gap-2">
              <button onClick={() => setChangingCuisine(false)} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}>Cancel</button>
              <button disabled={!targetCuisineId || moving} onClick={confirmMove} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={targetCuisineId ? { background: C.gold, color: C.bg } : { background: C.cardEdge, color: C.muted }}>Move</button>
            </div>
          </div>
        )}
        {open && fallenList.map((f, i) => (
          <div key={i} className="mt-2 rounded-lg p-3 text-xs" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
            <div className="font-bold" style={{ color: C.muted }}>{f.name} <span className="font-normal">· reigned until {fmt(f.dethronedAt)}</span></div>
            <p className="mt-1 italic" style={{ color: C.muted }}>&ldquo;{f.decree}&rdquo;</p>
          </div>))}
      </div>) : (<div className="mt-2">
        <p className="text-sm italic" style={{ color: C.muted }}>{featured ? "No overall favourite crowned yet." : "This throne sits empty."}</p>
        <button onClick={() => setModal({ cuisineId, cuisineName, mode: "claim" })} className="mt-3 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.gold, color: C.bg }}><Crown size={13} /> {featured ? "Crown your favourite" : "Crown a spot"}</button>
      </div>)}
    </div>
  );
}

// Google's own logomark, drawn inline so the button meets their branding
// guidelines (their four brand colors, not recolored to match the app).
function GoogleIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.1 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.2-5.5l-6.6-5.6C29.4 34.7 26.8 35.6 24 35.6c-5.2 0-9.6-3.3-11.2-7.9l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.4 36 44 30.6 44 24c0-1.3-.1-2.7-.4-3.5z"/>
    </svg>
  );
}

function SignInScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const handleGoogle = async () => {
    setError(""); setGoogleBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message);
      setGoogleBusy(false);
    }
  };

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

  // Typing the code in keeps you inside this same window the whole time -
  // no hop out to Safari and back, which is what breaks a home-screen PWA.
  const handleVerify = async (e) => {
    e.preventDefault();
    setError(""); setVerifying(true);
    try {
      await verifyCode(email, code.trim());
    } catch (err) {
      setError(err.message);
    }
    setVerifying(false);
  };

  return (
    <FontShell>
      <div className="flex min-h-screen items-center justify-center px-5">
        <div className="w-full max-w-sm rounded-2xl p-7 text-center" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
          <div className="flex items-center justify-center gap-2">
            <LogoMark size={28} />
            <h1 className="text-2xl tracking-[0.12em]" style={{ ...display, fontWeight: 900 }}>NOMARCHY</h1>
          </div>
          <p className={`mt-1 text-sm italic ${sent ? "mb-6" : ""}`} style={{ ...display, color: C.muted }}>Long live your favourites.</p>

          {!sent && (
            <p className="mb-6 mt-3 text-xs leading-relaxed" style={{ color: C.muted }}>
              Crown your favourite spot in every cuisine. When something better comes along, stage a coup. Compare your kingdom with friends, and climb the ranks as your picks earn trust.
            </p>
          )}

          {sent ? (
            <form onSubmit={handleVerify} className="flex flex-col gap-3">
              <p className="text-sm" style={{ color: C.muted }}>
                Check your email for a sign-in code and type it in below. (There&apos;s also a link in that email if you&apos;d rather tap that on a computer.)
              </p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-center text-lg tracking-[0.3em] outline-none"
                style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
              />
              {error && <p className="text-xs" style={{ color: C.coup }}>{error}</p>}
              <button type="submit" disabled={verifying} className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold" style={{ background: C.gold, color: C.bg }}>
                {verifying ? <Loader2 size={15} className="animate-spin" /> : <Crown size={15} />}
                {verifying ? "Verifying..." : "Verify and sign in"}
              </button>
              <button
                type="button"
                onClick={() => { setSent(false); setCode(""); setError(""); }}
                className="text-xs font-semibold"
                style={{ color: C.muted }}
              >
                Use a different email
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleGoogle}
                disabled={googleBusy}
                className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold"
                style={{ background: C.cream, color: "#1f1f1f" }}
              >
                {googleBusy ? <Loader2 size={15} className="animate-spin" /> : <GoogleIcon size={16} />}
                {googleBusy ? "Redirecting..." : "Continue with Google"}
              </button>

              <div className="flex items-center gap-2">
                <div className="h-px flex-1" style={{ background: C.cardEdge }} />
                <span className="text-xs" style={{ color: C.muted }}>or</span>
                <div className="h-px flex-1" style={{ background: C.cardEdge }} />
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
                />
                {error && <p className="text-xs" style={{ color: C.coup }}>{error}</p>}
                <button type="submit" disabled={submitting} className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold" style={{ background: C.gold, color: C.bg }}>
                  {submitting ? <Loader2 size={15} className="animate-spin" /> : <Crown size={15} />}
                  {submitting ? "Sending..." : "Send sign-in code"}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </FontShell>
  );
}

function ProfileModal({ profile, title, rank, nextRank, score, stats, onClose, onSubmit, onDeleteAccount }) {
  const [username, setUsername] = useState(profile?.username || "");
  const [city, setCity] = useState(profile?.city || "");
  const [isPublic, setIsPublic] = useState(profile?.is_public ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  const usernameValid = /^[a-z0-9-]{3,30}$/.test(username.trim().toLowerCase());
  const deleteConfirmed = deleteText.trim().toLowerCase() === profile?.username?.toLowerCase();

  const save = async () => {
    if (!usernameValid || busy) return;
    setBusy(true); setErr("");
    try {
      await onSubmit({ username: username.trim().toLowerCase(), city: city.trim() || null, is_public: isPublic });
      onClose();
    } catch (e) {
      setErr(e.message || "Couldn't save. Try again.");
    }
    setBusy(false);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmed || deleting) return;
    setDeleting(true); setDeleteErr("");
    try {
      await onDeleteAccount();
    } catch (e) {
      setDeleteErr(e.message || "Couldn't delete your account. Try again.");
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-3" style={{ background: C.card, borderBottom: `1px solid ${C.cardEdge}` }}>
          <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>Your profile</h3>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center" style={{ color: C.muted }}><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 pb-5">
        <div className="mt-3 text-center">
          <Crown size={30} className="mx-auto" style={{ color: C.gold }} fill={C.gold} strokeWidth={0} />
          <h2 className="mt-1 text-xl" style={{ ...display, fontWeight: 900 }}>{title}</h2>
          <p className="mt-1 text-sm italic" style={{ color: C.muted }}>
            {profile?.is_owner ? "Nomarchy exists because you built it." : rank.note}
          </p>
          <div className="mt-3 text-4xl" style={{ ...display, fontWeight: 900, color: C.gold }}>{score}</div>
          <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.14em" }}>Taste credibility</div>
          {nextRank && (<div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: C.bg }}>
              <div className="h-full rounded-full" style={{ background: C.gold, width: `${Math.min(100, ((score - rank.min) / (nextRank.min - rank.min)) * 100)}%` }} />
            </div>
            <p className="mt-1.5 text-xs" style={{ color: C.muted }}>{nextRank.min - score} to {nextRank.title}</p>
          </div>)}
        </div>

        <div className="mt-4">
          <RankLadder score={score} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-left">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
              <div className="text-xl" style={{ ...display, fontWeight: 700, color: C.gold }}>{s.n}</div>
              <div className="text-xs font-semibold">{s.label}</div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>{s.hint}</div>
            </div>))}
        </div>
        <p className="mt-4 text-xs leading-relaxed" style={{ color: C.muted }}>
          Credibility rewards conviction and depth, not hype. Honest write ups about real favourites outrank trendy picks with lazy decrees.
        </p>

        <div className="mt-6 border-t pt-4" style={{ borderColor: C.cardEdge }}>
          <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="lowercase, letters/numbers/hyphens"
            className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
          />
          <div className="mt-1 text-xs" style={{ color: usernameValid || !username ? C.muted : C.coup }}>
            This is what friends use to follow you (@{username.trim().toLowerCase() || "username"}) - 3+ characters, lowercase letters, numbers and hyphens only.
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Your city</label>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Toronto, Austin, Manchester"
            className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
          />
          <div className="mt-1 text-xs" style={{ color: C.muted }}>
            Used as the default city when looking up a place - set this if you&apos;re not in Toronto.
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div className="flex items-start gap-2">
            {isPublic ? <Globe size={16} className="mt-0.5 shrink-0" style={{ color: C.gold }} /> : <Lock size={16} className="mt-0.5 shrink-0" style={{ color: C.muted }} />}
            <div>
              <div className="text-sm font-semibold">{isPublic ? "Public profile" : "Private profile"}</div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>
                {isPublic
                  ? "Anyone with your link can see your kingdom."
                  : "Only you can see your kingdom - this hides it from your link and from friends' Court view too, until you go public again."}
              </div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isPublic}
            onClick={() => setIsPublic((v) => !v)}
            className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
            style={{ background: isPublic ? C.gold : C.cardEdge }}
          >
            <span
              className="absolute top-0.5 h-5 w-5 rounded-full transition-transform"
              style={{ background: C.bg, transform: isPublic ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>

        {err && <p className="mt-3 text-xs" style={{ color: C.coup }}>{err}</p>}

        <button
          disabled={!usernameValid || busy}
          onClick={save}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold"
          style={usernameValid ? { background: C.gold, color: C.bg } : { background: C.cardEdge, color: C.muted }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          Save
        </button>

        <div className="mt-6 rounded-lg p-3" style={{ border: `1px solid ${C.coup}55` }}>
          {!confirmingDelete ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold"
              style={{ color: C.coup }}
            >
              <Trash2 size={13} /> Delete my account
            </button>
          ) : (
            <div>
              <p className="text-xs leading-relaxed" style={{ color: C.coup }}>
                This permanently deletes your account and everything in it - every throne, your history, next in line, and follows. This cannot be undone.
              </p>
              <p className="mt-2 text-xs" style={{ color: C.muted }}>
                Type <span style={{ color: C.cream, fontWeight: 700 }}>{profile?.username}</span> to confirm.
              </p>
              <input
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
              />
              {deleteErr && <p className="mt-1.5 text-xs" style={{ color: C.coup }}>{deleteErr}</p>}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => { setConfirmingDelete(false); setDeleteText(""); setDeleteErr(""); }}
                  className="flex-1 rounded-lg py-2 text-xs font-bold"
                  style={{ border: `1px solid ${C.cardEdge}`, color: C.muted }}
                >
                  Cancel
                </button>
                <button
                  disabled={!deleteConfirmed || deleting}
                  onClick={confirmDelete}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold"
                  style={deleteConfirmed ? { background: C.coup, color: C.cream } : { background: C.cardEdge, color: C.muted }}
                >
                  {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  Delete everything
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

function MembersModal({ userId, onFollow, onClose }) {
  const [members, setMembers] = useState(null);
  const [err, setErr] = useState("");
  const [followBusy, setFollowBusy] = useState(null);

  useEffect(() => {
    loadDirectory(userId).then(setMembers).catch((e) => setErr(e.message || "Couldn't load members."));
  }, [userId]);

  const follow = async (m) => {
    setFollowBusy(m.id);
    try {
      await onFollow(m.id);
      setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, alreadyFollowing: true } : x)));
    } catch (e) {
      setErr(e.message || "Couldn't follow");
    }
    setFollowBusy(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>Find people</h3>
          <button onClick={onClose} aria-label="Close" style={{ color: C.muted }}><X size={18} /></button>
        </div>
        <p className="mt-1 text-xs" style={{ color: C.muted }}>Public kingdoms only - private profiles won&apos;t show up here.</p>

        {err && <p className="mt-3 text-xs" style={{ color: C.coup }}>{err}</p>}
        {!members && !err && <p className="mt-3 text-sm" style={{ color: C.muted }}>Loading...</p>}
        {members?.length === 0 && <p className="mt-3 text-sm" style={{ color: C.muted }}>No one to find yet.</p>}

        <div className="mt-3">
          {members?.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2" style={{ borderTop: `1px solid ${C.cardEdge}` }}>
              <div className="flex items-center gap-1.5">
                <div>
                  <div className="text-sm font-semibold">{m.name}</div>
                  <div className="text-xs" style={{ color: C.muted }}>@{m.username}</div>
                </div>
                {m.isOwner && <OwnerBadge size={12} />}
              </div>
              {m.alreadyFollowing ? (
                <span className="text-xs font-semibold" style={{ color: C.muted }}>Following</span>
              ) : (
                <button
                  onClick={() => follow(m)}
                  disabled={followBusy === m.id}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
                  style={{ background: C.gold, color: C.bg }}
                >
                  {followBusy === m.id ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />} Follow
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeedbackModal({ onClose, onSubmit }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const send = async () => {
    if (!message.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      await onSubmit(message.trim());
      setSent(true);
    } catch (e) {
      setErr(e.message || "Couldn't send that. Try again.");
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>Feedback</h3>
          <button onClick={onClose} aria-label="Close" style={{ color: C.muted }}><X size={18} /></button>
        </div>

        {sent ? (
          <div className="mt-4 text-center">
            <Check size={22} className="mx-auto" style={{ color: C.green }} />
            <p className="mt-2 text-sm" style={{ color: C.muted }}>Got it, thank you.</p>
            <button onClick={onClose} className="mt-4 w-full rounded-lg py-2.5 text-sm font-bold" style={{ background: C.gold, color: C.bg }}>Close</button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm" style={{ color: C.muted }}>
              Found a bug, something confusing, or an idea? Say as much or as little as you like.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              autoFocus
              placeholder="What happened, or what would help?"
              className="mt-3 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
            />
            {err && <p className="mt-2 text-xs" style={{ color: C.coup }}>{err}</p>}
            <button
              disabled={!message.trim() || busy}
              onClick={send}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold"
              style={message.trim() ? { background: C.gold, color: C.bg } : { background: C.cardEdge, color: C.muted }}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <MessageSquare size={15} />}
              Send
            </button>
          </>
        )}
      </div>
    </div>
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
          <select value={cz} onChange={(e) => setCz(e.target.value)} className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: cz ? C.cream : C.muted }}>
            {!cz && <option value="">Choose a cuisine...</option>}
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
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState("");

  // A slow confirm (creating several new custom cuisines can take a moment)
  // with no busy state on the button invited an impatient double-click,
  // which fired two full imports of the same list a few seconds apart.
  const confirmImport = async (keptRows) => {
    if (confirming) return;
    setConfirming(true);
    try {
      await onImport(keptRows);
    } finally {
      setConfirming(false);
    }
  };

  const parse = async () => {
    if (!raw.trim() || working) return;
    setWorking(true); setErr("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ mode: "import", raw: raw.trim().slice(0, MAX_IMPORT_CHARS), cuisines: cuisineNames }),
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
          <textarea value={raw} onChange={(e) => setRaw(e.target.value)} rows={8} maxLength={MAX_IMPORT_CHARS}
            placeholder={"Bar Prima - pizza, Little Italy, best margherita\nPai (thai) khao soi!!\nKinton Ramen, Annex\nsunny's chinese - kensington, cumin lamb"}
            className="mt-3 w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
          <div className="mt-1 text-right text-xs" style={{ color: C.muted }}>{raw.length}/{MAX_IMPORT_CHARS}</div>
          {raw.length >= MAX_IMPORT_CHARS && (
            <p className="mt-1 text-xs" style={{ color: C.coup }}>
              That&apos;s the most we can process in one go - paste the rest as a second import after this one.
            </p>
          )}
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
          <p className="mt-2 text-sm" style={{ color: C.muted }}>Found {rows.length}. Fix anything it got wrong, untick anything you don&apos;t want. Cuisine&apos;s left blank where it wasn&apos;t stated - pick one or leave it for later.</p>
          <div className="mt-3">
            {rows.map((r) => (
              <div key={r._id} className="mb-2 rounded-lg p-2.5" style={{ background: C.bg, border: `1px solid ${r._keep ? C.cardEdge : C.cardEdge + "55"}`, opacity: r._keep ? 1 : 0.45 }}>
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={r.name}
                    onChange={(e) => update(r._id, "name", e.target.value)}
                    className="flex-1 rounded bg-transparent px-1 py-0.5 text-sm font-bold outline-none"
                    style={{ color: C.cream }}
                  />
                  <button onClick={() => update(r._id, "_keep", !r._keep)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                    style={r._keep ? { background: C.gold, color: C.bg } : { border: `1px solid ${C.cardEdge}` }}>
                    {r._keep && <Check size={12} strokeWidth={3} />}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <select value={r.cuisine} onChange={(e) => update(r._id, "cuisine", e.target.value)} className="shrink-0 rounded px-2 py-1 text-xs outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: r.cuisine ? C.cream : C.muted }}>
                    {!r.cuisine && <option value="">Choose a cuisine...</option>}
                    {[...new Set([r.cuisine, ...cuisineNames].filter(Boolean))].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input
                    value={r.area || ""}
                    onChange={(e) => update(r._id, "area", e.target.value)}
                    placeholder="area"
                    className="flex-1 rounded px-2 py-1 text-xs outline-none"
                    style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }}
                  />
                </div>
                <input
                  value={r.note || ""}
                  onChange={(e) => update(r._id, "note", e.target.value)}
                  placeholder="note (optional)"
                  className="mt-1.5 w-full rounded bg-transparent px-1 py-0.5 text-xs italic outline-none"
                  style={{ color: C.muted }}
                />
              </div>))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setRows(null)} className="rounded-lg px-4 py-3 text-sm font-bold" style={{ border: `1px solid ${C.cardEdge}`, color: C.muted }}>Back</button>
            <button disabled={!keeping.length || confirming} onClick={() => confirmImport(keeping.map(({ _id, _keep, ...r }) => r))}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold"
              style={keeping.length && !confirming ? { background: C.gold, color: C.bg } : { background: C.cardEdge, color: C.muted }}>
              {confirming ? <Loader2 size={15} className="animate-spin" /> : <Bookmark size={15} />}
              {confirming ? "Adding..." : `Add ${keeping.length} to Next in Line`}
            </button>
          </div>
        </>)}
      </div>
    </div>);
}
