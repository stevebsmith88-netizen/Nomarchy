"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Crown, Plus, ScrollText, Swords, X, Users, ChevronDown, ChevronUp,
  MapPin, Search, Star, ExternalLink, Loader2, Bookmark, Share2, Check, Trash2,
  ClipboardPaste, Wand2, LogOut, UserPlus, Pencil, RotateCcw, Globe, Lock,
  MessageSquare, Bell, TrendingUp, Navigation, Camera, Mail, ShieldCheck,
} from "lucide-react";
import {
  supabase, getUser, onAuthChange, signIn, verifyCode, signInWithGoogle, signOut, getProfile, updateProfile, deleteAccount, submitFeedback,
  linkGoogle, unlinkGoogle, getLinkedProviders,
  loadDirectory, loadSuggestedFriends, loadCrownedThrones, groupCrownedThrones, placeKey, loadFollowers, followUser, loadNotifications, markNotificationsSeen,
  loadKingdom, loadNextInLine, loadCuisines, addCuisine,
  crownSpot, promoteToThrone, addToNextInLine, importToNextInLine, removeFromNextInLine, markVisited, updatePretenderCuisine, updatePretenderNote, updatePretenderVerdict, updatePretenderPhotos,
  moveThroneCuisine, updateThroneDecree, updateThronePhotos, unCrown,
  uploadReviewPhoto, deleteReviewPhoto, uploadAvatar, MAX_REVIEW_PHOTOS,
  loadCourt, toggleEndorsement, followByUsername, loadStanding,
  loadAdminOverview,
} from "@/lib/data";
import { C, display, body, RANKS, getRank, getTitle, RankBadge, OwnerBadge, LogoMark, FontShell, useTheme } from "./theme";

// Leaflet touches window/document at load time, which breaks server-side
// rendering - ssr:false defers loading it until the browser actually
// needs it (i.e. someone switches the Kingdom tab to Map view).
const KingdomMap = dynamic(() => import("./KingdomMap"), { ssr: false });
const NextInLineMap = dynamic(() => import("./NextInLineMap"), { ssr: false });

const MIN_DECREE_LENGTH = 30;
const MAX_IMPORT_CHARS = 20000;
// Module scope, evaluated once when the page loads - not inside the
// component, where calling Date.now() directly would be an impure render
// (react-hooks/purity). A Trending range like "this week" doesn't need
// to be precise to the second anyway, just roughly right for the session.
const NOW = Date.now();

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

// A plain, manually-typed "Mizunara" and a looked-up "Mizunara Japanese
// Whisky Experience" are the same real place, not a coincidence - one
// name sitting inside the other is a much stronger signal than an exact
// match requires. The length floor keeps a short generic word (say
// "Bar") from falsely matching everything that happens to contain it.
const sameRestaurant = (a, b) => {
  const na = normalizeName(a), nb = normalizeName(b);
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 5 && longer.includes(shorter);
};

export default function Nomarchy() {
  // No return value used here - just subscribing this whole page to theme
  // changes so it (and everything under it) re-renders and picks up C's
  // current values when the toggle in Profile is used. See theme.js.
  useTheme();
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
  const [addPretenderPrefillName, setAddPretenderPrefillName] = useState("");
  const [importing, setImporting] = useState(false);
  const [historyOpen, setHistoryOpen] = useState({});
  const [courtModalFriendId, setCourtModalFriendId] = useState(null);
  const [newCuisine, setNewCuisine] = useState("");
  const [addingCuisine, setAddingCuisine] = useState(false);
  const [onlyCrowned, setOnlyCrowned] = useState(false);
  const [kingdomView, setKingdomView] = useState("grid");
  const [hiddenCuisinesOpen, setHiddenCuisinesOpen] = useState(false);
  const [nilView, setNilView] = useState("grid");
  const [nilCuisineFilter, setNilCuisineFilter] = useState("");
  const [adminData, setAdminData] = useState(null);
  const [adminError, setAdminError] = useState("");
  const [pretenderSearch, setPretenderSearch] = useState("");
  const [toast, setToast] = useState("");

  const [followInput, setFollowInput] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState("");

  const [editingProfile, setEditingProfile] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  const [top25, setTop25] = useState(null);
  const [top25Error, setTop25Error] = useState("");
  const [top25City, setTop25City] = useState("");
  const [top25Range, setTop25Range] = useState("all");
  const [top25Locating, setTop25Locating] = useState(false);

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
        const notifs = await loadNotifications(user.id, p.notifications_seen_at, p);
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

  useEffect(() => {
    if (tab !== "top25" || top25 !== null) return;
    loadCrownedThrones().then(setTop25).catch((e) => setTop25Error(e.message || "Couldn't load the leaderboard."));
  }, [tab, top25]);

  useEffect(() => {
    if (tab !== "admin" || !profile?.is_owner || adminData !== null || adminError) return;
    loadAdminOverview().then(setAdminData).catch((e) => setAdminError(e.message || "Couldn't load admin data."));
  }, [tab, profile?.is_owner, adminData, adminError]);

  const handleNearMe = () => {
    if (!navigator.geolocation) {
      setTop25Error("Your browser won't share your location.");
      return;
    }
    setTop25Locating(true); setTop25Error("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await fetch("/api/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Couldn't figure out where you are");
          setTop25City(data.city);
        } catch (e) {
          setTop25Error(e.message || "Couldn't figure out where you are");
        }
        setTop25Locating(false);
      },
      () => {
        setTop25Error("Location access was blocked - try entering your city instead.");
        setTop25Locating(false);
      }
    );
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
  const hiddenCuisineIds = new Set(profile?.hidden_cuisine_ids || []);
  const hiddenCuisines = selectableCuisines.filter((c) => hiddenCuisineIds.has(c.id));

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

  const handleEditDecree = async (throneId, decree) => {
    await updateThroneDecree(throneId, decree);
    await refreshKingdom();
  };

  const handleEditThronePhotos = async (throneId, photos) => {
    await updateThronePhotos(throneId, photos);
    await refreshKingdom();
  };

  const handleUnCrown = async (cuisineId, throne) => {
    await unCrown(user.id, throne.id, {
      name: throne.name,
      area: throne.area,
      address: throne.address,
      rating: throne.rating,
      mapsUrl: throne.mapsUrl,
      photos: throne.photos,
      lat: throne.lat,
      lng: throne.lng,
      cuisineId,
    });
    await refreshKingdom();
    await refreshPretenders();
    await refreshStanding();
    flash(`${throne.name} un-crowned, back in Next in Line`);
  };

  const addToPretenders = async (cuisineId, entry) => {
    if (pretenders.some((p) => sameRestaurant(p.name, entry.name))) {
      throw new Error("Already Next in Line");
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

  const handleChangePretenderVerdict = async (id, verdict) => {
    await updatePretenderVerdict(id, verdict);
    await refreshPretenders();
  };

  const handleChangePretenderPhotos = async (id, photos) => {
    await updatePretenderPhotos(id, photos);
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
    const existingNames = pretenders.map((p) => p.name);
    let localCuisines = cuisineList;
    const resolved = [];
    for (const r of rows) {
      if (existingNames.some((n) => sameRestaurant(n, r.name))) { skipped++; continue; }
      existingNames.push(r.name);
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
      resolved.push({ name: r.name.toUpperCase(), area: r.area || null, note: r.note || null, cuisineId: match?.id || null });
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
    const params = new URLSearchParams({
      cuisine: cuisineName, name: r.name, area: r.area || "",
      rating: r.rating || "", decree: r.decree || "", username: profile?.username || "",
    });
    const cardUrl = `/api/card?${params.toString()}`;

    // A native share sheet with the branded card image beats a clipboard
    // copy every time - people can post straight to a story or DM it. Not
    // every browser can share a file though (most desktop browsers can't),
    // so this always has the old copy-the-text behaviour to fall back to.
    try {
      const res = await fetch(cardUrl);
      const blob = await res.blob();
      const file = new File([blob], "nomarchy-pick.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Nomarchy", text });
        return;
      }
    } catch (e) {
      if (e?.name === "AbortError") return; // they closed the share sheet - not an error
    }

    try {
      await navigator.clipboard.writeText(text);
      flash("Pick copied, paste it in the group chat");
    } catch {
      flash("Couldn't copy on this device");
    }
  };

  // Their own public kingdom link doubles as the invite - it's already a
  // real, personal landing page (their crowns, their decrees), not a bare
  // signup form, so whoever clicks it sees something worth joining for
  // before they're ever asked to.
  const handleInviteFriend = async () => {
    const url = `https://nomarchy.ca/${profile?.username || ""}`;
    const text = "Join me on Nomarchy - crown your favourite restaurant in every cuisine, and see what your friends swear by.";
    try {
      if (navigator.canShare?.({ text, url })) {
        await navigator.share({ title: "Nomarchy", text, url });
        return;
      }
    } catch (e) {
      if (e?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      flash("Invite link copied");
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

  const handleHideCuisine = async (cuisineId) => {
    if (!cuisineId || hiddenCuisineIds.has(cuisineId)) return;
    await handleUpdateProfile({ hidden_cuisine_ids: [...hiddenCuisineIds, cuisineId] });
  };

  const handleUnhideCuisine = async (cuisineId) => {
    await handleUpdateProfile({ hidden_cuisine_ids: [...hiddenCuisineIds].filter((id) => id !== cuisineId) });
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
  const shown = onlyCrowned
    ? cuisineNames.filter((c) => slots[c]?.current)
    : cuisineNames.filter((c) => slots[c]?.current || !hiddenCuisineIds.has(selectableCuisines.find((sc) => sc.name === c)?.id));

  // Cuisine filter for Next in Line (grid and map both) - "fancying pizza,
  // what are my options" - matched by cuisine NAME rather than id, since
  // that's the one field both a crowned throne (slots is keyed by name)
  // and a next_in_line pick (pretenders' own .cuisine string) already
  // share, with no join needed. Options are only cuisines actually present
  // right now, plus Uncategorized if anything's untagged - not the full
  // app-wide cuisine list, most of which wouldn't match anything here.
  const nilCuisineOptions = Array.from(new Set(pretenders.map((p) => p.cuisine).filter(Boolean))).sort();
  const nilHasUncategorized = pretenders.some((p) => !p.cuisine);
  const matchesNilCuisine = (cuisineName) =>
    !nilCuisineFilter || (nilCuisineFilter === "__uncategorized__" ? !cuisineName : cuisineName === nilCuisineFilter);

  const kingdomPins = Object.entries(slots)
    .filter(([cuisineName, slot]) => slot.current?.lat && slot.current?.lng && matchesNilCuisine(cuisineName))
    .map(([cuisineName, slot]) => ({ lat: slot.current.lat, lng: slot.current.lng, name: slot.current.name, cuisine: cuisineName }));
  // Two buckets for the Next in Line map, matching "where I've been" vs
  // "where I still want to go" - a crowned favourite counts as "been"
  // alongside any next_in_line pick already marked visited, whether or
  // not it ever became a throne.
  const beenPins = [
    ...kingdomPins,
    ...pretenders.filter((p) => p.lat && p.lng && p.visitedAt && matchesNilCuisine(p.cuisine)).map((p) => ({ lat: p.lat, lng: p.lng, name: p.name, cuisine: p.cuisine || "Uncategorized" })),
  ];
  const wantPins = pretenders
    .filter((p) => p.lat && p.lng && !p.visitedAt && matchesNilCuisine(p.cuisine))
    .map((p) => ({ lat: p.lat, lng: p.lng, name: p.name, cuisine: p.cuisine || "Uncategorized" }));

  const pretenderQuery = pretenderSearch.trim().toLowerCase();
  const filteredPretenders = pretenders.filter((p) => {
    const matchesQuery = !pretenderQuery || [p.name, p.cuisine, p.area, p.note].some((f) => f && f.toLowerCase().includes(pretenderQuery));
    return matchesQuery && matchesNilCuisine(p.cuisine);
  });
  const sortByName = (a, b) => a.name.localeCompare(b.name);
  const stillToTry = filteredPretenders.filter((p) => !p.visitedAt).sort(sortByName);
  const beenTo = filteredPretenders.filter((p) => p.visitedAt).sort(sortByName);

  // "A friend's already been here" - built from data already loaded for
  // Court (picks + reviews per friend), matched by the same
  // name+address/area key Trending uses, so a place in your own Next in
  // Line can point back to a friend's crowned pick or visited review of
  // that exact same restaurant without a separate query.
  const friendActivityByPlace = new Map();
  for (const f of court) {
    for (const p of f.picks) {
      const key = placeKey(p.name, p.address, p.area);
      if (!friendActivityByPlace.has(key)) friendActivityByPlace.set(key, []);
      friendActivityByPlace.get(key).push({ friend: f.name, crowned: true, cuisine: p.cuisine, text: p.decree });
    }
    for (const r of f.reviews) {
      if (!r.note && !r.verdict) continue;
      const key = placeKey(r.name, r.address, r.area);
      if (!friendActivityByPlace.has(key)) friendActivityByPlace.set(key, []);
      friendActivityByPlace.get(key).push({ friend: f.name, crowned: false, cuisine: r.cuisine, text: r.note, verdict: r.verdict });
    }
  }

  // NOW is a module-level constant (evaluated once at page load), not a
  // fresh Date.now() call here - calling that directly in render is an
  // impure render (react-hooks/purity), and a Trending range like "this
  // week" doesn't need per-render precision anyway.
  const RANGE_MS = { all: Infinity, year: 365 * 86400000, month: 30 * 86400000, week: 7 * 86400000 };
  const trendingCutoff = NOW - RANGE_MS[top25Range];
  const trendingList = top25 && groupCrownedThrones(top25.filter((t) => new Date(t.crowned_at).getTime() >= trendingCutoff));

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
            <button onClick={() => setEditingProfile(true)} className="flex items-center gap-1.5">
              <Avatar url={profile?.avatar_url} size={18} />
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
                      {n.type === "follow" && <><span style={{ fontWeight: 700 }}>{n.name}</span> started following you</>}
                      {n.type === "crown" && <><span style={{ fontWeight: 700 }}>{n.name}</span> crowned <span style={{ color: C.gold }}>{n.place}</span> for {n.cuisine}</>}
                      {n.type === "review" && <><span style={{ fontWeight: 700 }}>{n.name}</span> tried <span style={{ color: C.gold }}>{n.place}</span>{n.cuisine ? ` for ${n.cuisine}` : ""}</>}
                      {n.type === "endorse" && <><span style={{ fontWeight: 700 }}>{n.name}</span> endorsed your <span style={{ color: C.gold }}>{n.place}</span> pick</>}
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
        {[
          { id: "kingdom", label: "Kingdom", icon: Crown },
          { id: "pretenders", label: "Next in Line", icon: Bookmark },
          { id: "court", label: "Court", icon: Users },
          { id: "top25", label: "Trending", icon: TrendingUp },
          ...(profile?.is_owner ? [{ id: "admin", label: "Admin", icon: ShieldCheck }] : []),
        ].map(({ id, label, icon: Icon }) => (
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
                onEditDecree={(decree) => handleEditDecree(slots[OVERALL_FAVOURITE_NAME]?.current?.id, decree)}
                onEditPhotos={(photos) => handleEditThronePhotos(slots[OVERALL_FAVOURITE_NAME]?.current?.id, photos)}
                userId={user.id}
              />
            </div>
          )}

          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm" style={{ color: C.muted }}>One throne per cuisine. Choose like it matters.</p>
            <div className="flex w-full items-center gap-2 sm:w-auto sm:shrink-0">
              {kingdomView === "grid" && (
                <button onClick={() => setOnlyCrowned(!onlyCrowned)} className="min-w-[124px] rounded-full px-3 py-1 text-center text-xs font-semibold" style={{ background: onlyCrowned ? C.gold : C.card, color: onlyCrowned ? C.bg : C.muted, border: `1px solid ${C.cardEdge}` }}>
                  {onlyCrowned ? "Showing crowned" : "Show all"}
                </button>
              )}
              <div className="ml-auto flex overflow-hidden rounded-full" style={{ border: `1px solid ${C.cardEdge}` }}>
                <button onClick={() => setKingdomView("grid")} className="px-3 py-1 text-xs font-semibold" style={{ background: kingdomView === "grid" ? C.gold : C.card, color: kingdomView === "grid" ? C.bg : C.muted }}>
                  Grid
                </button>
                <button onClick={() => setKingdomView("map")} className="px-3 py-1 text-xs font-semibold" style={{ background: kingdomView === "map" ? C.gold : C.card, color: kingdomView === "map" ? C.bg : C.muted, borderLeft: `1px solid ${C.cardEdge}` }}>
                  Map
                </button>
              </div>
            </div>
          </div>

          {!onlyCrowned && hiddenCuisines.length > 0 && (
            <div className="mb-3">
              <button onClick={() => setHiddenCuisinesOpen((v) => !v)} className="text-xs font-semibold" style={{ color: C.muted }}>
                {hiddenCuisinesOpen ? "Hide" : "Show"} hidden cuisines ({hiddenCuisines.length})
              </button>
              {hiddenCuisinesOpen && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {hiddenCuisines.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => handleUnhideCuisine(c.id)}
                      className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                      style={{ background: C.card, color: C.muted, border: `1px solid ${C.cardEdge}` }}
                    >
                      {c.name} <X size={11} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {kingdomView === "map" ? (
            <KingdomMap pins={kingdomPins} />
          ) : (
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
                  onEditDecree={(decree) => handleEditDecree(slots[cuisineName]?.current?.id, decree)}
                  onEditPhotos={(photos) => handleEditThronePhotos(slots[cuisineName]?.current?.id, photos)}
                  onHide={() => handleHideCuisine(thisId)}
                  userId={user.id}
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
          )}
        </div>)}

        {/* PRETENDERS */}
        {tab === "pretenders" && (<div>
          <p className="mb-3 text-sm" style={{ color: C.muted }}>The places waiting for their shot at a throne. Go, eat, then decide.</p>
          <div className="mb-3 flex gap-2">
            <button onClick={() => { setAddPretenderPrefillName(""); setAddPretender(true); }} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold" style={{ background: C.gold, color: C.bg }}><Plus size={16} /> Add a place</button>
            <button onClick={() => setImporting(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold" style={{ border: `1px solid ${C.gold}66`, color: C.gold }}><ClipboardPaste size={16} /> Import a list</button>
          </div>

          {pretenders.length > 0 && (
            <div className="mb-3 flex items-center justify-between gap-2">
              <select
                value={nilCuisineFilter}
                onChange={(e) => setNilCuisineFilter(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-xs outline-none"
                style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: nilCuisineFilter ? C.gold : C.cream }}
              >
                <option value="">All cuisines</option>
                {nilCuisineOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                {nilHasUncategorized && <option value="__uncategorized__">Uncategorized</option>}
              </select>
              <div className="flex shrink-0 overflow-hidden rounded-full" style={{ border: `1px solid ${C.cardEdge}` }}>
                <button onClick={() => setNilView("grid")} className="px-3 py-1 text-xs font-semibold" style={{ background: nilView === "grid" ? C.gold : C.card, color: nilView === "grid" ? C.bg : C.muted }}>
                  Grid
                </button>
                <button onClick={() => setNilView("map")} className="px-3 py-1 text-xs font-semibold" style={{ background: nilView === "map" ? C.gold : C.card, color: nilView === "map" ? C.bg : C.muted, borderLeft: `1px solid ${C.cardEdge}` }}>
                  Map
                </button>
              </div>
            </div>
          )}

          {nilView === "map" && pretenders.length > 0 ? (
            <NextInLineMap beenPins={beenPins} wantPins={wantPins} />
          ) : (<>
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
              <p className="text-sm" style={{ color: C.muted }}>
                {pretenderSearch ? <>Nothing matches &ldquo;{pretenderSearch}&rdquo;.</> : "Nothing in that cuisine yet."}
              </p>
              {pretenderSearch && (
                <button
                  onClick={() => { setAddPretenderPrefillName(pretenderSearch); setAddPretender(true); }}
                  className="mx-auto mt-2 flex items-center gap-1.5 text-sm font-semibold"
                  style={{ color: C.gold }}
                >
                  <Plus size={14} /> Add &ldquo;{pretenderSearch}&rdquo; to your list
                </button>
              )}
            </div>
          ) : (<>
            {stillToTry.length > 0 && (<>
              <h3 className="mb-2 text-xs font-bold uppercase" style={{ color: C.gold, letterSpacing: "0.14em" }}>Still to try</h3>
              {stillToTry.map((p) => (
                <PretenderCard key={p.id} p={p} selectableCuisines={selectableCuisines} userId={user.id}
                  friendMatches={friendActivityByPlace.get(placeKey(p.name, p.address, p.area))}
                  onRemove={handleRemovePretender} onChangeNote={handleChangePretenderNote}
                  onChangeCuisine={handleChangePretenderCuisine} onChangePhotos={handleChangePretenderPhotos} onToggleVisited={handleToggleVisited}
                  onChangeVerdict={handleChangePretenderVerdict}
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
                <PretenderCard key={p.id} p={p} selectableCuisines={selectableCuisines} userId={user.id}
                  friendMatches={friendActivityByPlace.get(placeKey(p.name, p.address, p.area))}
                  onRemove={handleRemovePretender} onChangeNote={handleChangePretenderNote}
                  onChangeCuisine={handleChangePretenderCuisine} onChangePhotos={handleChangePretenderPhotos} onToggleVisited={handleToggleVisited}
                  onChangeVerdict={handleChangePretenderVerdict}
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
          </>)}
        </div>)}

        {/* COURT */}
        {tab === "court" && (<div>
          <p className="mb-3 text-sm" style={{ color: C.muted }}>Your friends&apos; reigning picks. Endorse the good ones, or add them to your own shortlist.</p>

          <button onClick={handleInviteFriend} className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold" style={{ background: C.gold, color: C.bg }}>
            <Share2 size={14} /> Invite a friend
          </button>

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
          ) : court.map((f) => (
            <button
              key={f.id}
              onClick={() => setCourtModalFriendId(f.id)}
              className="mb-3 flex w-full items-center justify-between gap-2 rounded-xl p-4 text-left"
              style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}
            >
              <div className="flex items-center gap-2">
                <Avatar url={f.avatarUrl} size={32} />
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
                  <p className="mt-1 text-xs" style={{ color: C.muted }}>
                    {f.picks.length === 0 && f.reviews.length === 0
                      ? "No thrones claimed yet."
                      : [
                          f.picks.length ? `${f.picks.length} pick${f.picks.length === 1 ? "" : "s"}` : null,
                          f.reviews.length ? `${f.reviews.length} review${f.reviews.length === 1 ? "" : "s"}` : null,
                        ].filter(Boolean).join(", ")}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-xs font-semibold" style={{ color: C.gold }}>{f.score}</span>
                <ChevronDown size={16} style={{ color: C.muted, transform: "rotate(-90deg)" }} />
              </div>
            </button>
          ))}
        </div>)}

        {/* TRENDING */}
        {tab === "top25" && (<div>
          <p className="mb-3 text-sm" style={{ color: C.muted }}>The most-crowned restaurants across everyone&apos;s public kingdoms.</p>
          <div className="mb-2 flex gap-2">
            <select
              value={top25Range}
              onChange={(e) => setTop25Range(e.target.value)}
              className="rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }}
            >
              <option value="all">All time</option>
              <option value="year">This year</option>
              <option value="month">This month</option>
              <option value="week">This week</option>
            </select>
            <input value={top25City} onChange={(e) => setTop25City(e.target.value)} placeholder="Filter by city or neighbourhood" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
            <button onClick={handleNearMe} disabled={top25Locating} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-bold" style={{ background: C.card, color: C.muted, border: `1px solid ${C.cardEdge}` }}>
              {top25Locating ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />} Near me
            </button>
          </div>
          {top25City && <button onClick={() => setTop25City("")} className="mb-3 text-xs font-semibold" style={{ color: C.muted }}>Clear filter</button>}
          {top25Error && <p className="mb-3 text-xs" style={{ color: C.coup }}>{top25Error}</p>}
          {!top25 && !top25Error && <p className="text-sm" style={{ color: C.muted }}>Loading...</p>}
          {trendingList && (() => {
            const q = top25City.trim().toLowerCase();
            const filtered = q
              ? trendingList.filter((p) => [p.area, p.address].filter(Boolean).some((f) => f.toLowerCase().includes(q)))
              : trendingList;
            const shownPlaces = filtered.slice(0, 25);
            if (shownPlaces.length === 0) return <p className="text-sm" style={{ color: C.muted }}>Nothing crowned in that window yet.</p>;
            return shownPlaces.map((p, i) => (
              <div key={i} className="mb-2 flex items-center gap-3 rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ background: i < 3 ? C.gold : C.bg, color: i < 3 ? C.bg : C.muted }}>{i + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{p.name}</span>
                    {p.rating && <span className="flex shrink-0 items-center gap-0.5 text-xs" style={{ color: C.gold }}><Star size={11} fill={C.gold} /> {p.rating}</span>}
                  </div>
                  <div className="truncate text-xs" style={{ color: C.muted }}>{[p.area, p.address].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="shrink-0 text-right">
                  {p.mapsUrl && <a href={p.mapsUrl} target="_blank" rel="noreferrer" className="mb-0.5 flex items-center gap-0.5 text-xs font-semibold" style={{ color: C.gold }}>Map <ExternalLink size={10} /></a>}
                  <div className="text-lg" style={{ ...display, fontWeight: 700, color: C.gold }}>{p.count}</div>
                  <div className="text-[10px] uppercase" style={{ color: C.muted, letterSpacing: "0.08em" }}>{p.count === 1 ? "crown" : "crowns"}</div>
                </div>
              </div>
            ));
          })()}
        </div>)}

        {/* ADMIN (owner-only tab - see loadAdminOverview in lib/data.js) */}
        {tab === "admin" && (<div>
          {!adminData && !adminError && <p className="text-sm" style={{ color: C.muted }}>Loading admin overview...</p>}
          {adminError && <p className="mb-3 text-sm" style={{ color: C.coup }}>{adminError}</p>}
          {adminData && (<>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Total users", adminData.stats.totalUsers],
                ["Active, last 30d", adminData.stats.activeLast30d],
                ["New this week", adminData.stats.newThisWeek],
                ["Total crowns", adminData.stats.totalCrowns],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl p-3 text-center" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
                  <div className="text-2xl" style={{ ...display, fontWeight: 900, color: C.gold }}>{value}</div>
                  <div className="mt-0.5 text-xs" style={{ color: C.muted }}>{label}</div>
                </div>
              ))}
            </div>

            <h3 className="mb-2 mt-5 text-xs font-bold uppercase" style={{ color: C.gold, letterSpacing: "0.14em" }}>All users ({adminData.users.length})</h3>
            <div className="max-h-96 overflow-y-auto rounded-xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
              {adminData.users.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 px-3 py-2" style={{ borderTop: `1px solid ${C.cardEdge}` }}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">@{u.username}{!u.onboarded && <span className="ml-1.5 text-xs font-normal" style={{ color: C.muted }}>(not onboarded)</span>}</div>
                    <div className="truncate text-xs" style={{ color: C.muted }}>{u.email || "no email on file"}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs" style={{ color: C.muted }}>
                    <div>Joined {fmt(u.createdAt)}</div>
                    <div>{u.lastSignInAt ? `Last in ${fmt(u.lastSignInAt)}` : "Never signed in"}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase" style={{ color: C.gold, letterSpacing: "0.14em" }}>Most-crowned places</h3>
                <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
                  {adminData.topPlaces.length === 0 && <p className="p-3 text-sm" style={{ color: C.muted }}>Nothing crowned yet.</p>}
                  {adminData.topPlaces.map((p, i) => (
                    <div key={p.name} className="flex items-center justify-between px-3 py-2 text-sm" style={i > 0 ? { borderTop: `1px solid ${C.cardEdge}` } : undefined}>
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 font-bold" style={{ color: C.gold }}>{p.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase" style={{ color: C.gold, letterSpacing: "0.14em" }}>Most-crowned cuisines</h3>
                <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
                  {adminData.topCuisines.length === 0 && <p className="p-3 text-sm" style={{ color: C.muted }}>Nothing crowned yet.</p>}
                  {adminData.topCuisines.map((c, i) => (
                    <div key={c.name} className="flex items-center justify-between px-3 py-2 text-sm" style={i > 0 ? { borderTop: `1px solid ${C.cardEdge}` } : undefined}>
                      <span className="truncate">{c.name}</span>
                      <span className="shrink-0 font-bold" style={{ color: C.gold }}>{c.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <h3 className="mb-2 mt-5 text-xs font-bold uppercase" style={{ color: C.gold, letterSpacing: "0.14em" }}>Feedback ({adminData.feedback.length})</h3>
            {adminData.feedback.length === 0 ? (
              <p className="text-sm" style={{ color: C.muted }}>Nothing submitted yet.</p>
            ) : (
              <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
                {adminData.feedback.map((f, i) => (
                  <div key={f.id} className="px-3 py-2.5" style={i > 0 ? { borderTop: `1px solid ${C.cardEdge}` } : undefined}>
                    <div className="flex items-center justify-between gap-2 text-xs" style={{ color: C.muted }}>
                      <span>@{f.username || "unknown"}{f.page ? ` · ${f.page}` : ""}</span>
                      <span className="shrink-0">{fmt(f.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm">{f.message}</p>
                  </div>
                ))}
              </div>
            )}
          </>)}
        </div>)}

        </>)}
      </main>

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[1200] -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg" style={{ background: C.gold, color: C.bg }}>
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
          userId={user.id}
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

      {courtModalFriendId && (() => {
        const f = court.find((x) => x.id === courtModalFriendId);
        if (!f) return null;
        return (
          <FriendKingdomModal
            friend={f}
            onClose={() => setCourtModalFriendId(null)}
            onEndorse={handleEndorse}
            onAddToList={addFriendPickToPretenders}
          />
        );
      })()}

      {addPretender && selectableCuisines.length > 0 && (
        <PlaceModal
          mode="pretender"
          cuisineId={selectableCuisines[0]?.id}
          cuisineName={selectableCuisines[0]?.name}
          cuisines={selectableCuisines}
          prefill={addPretenderPrefillName ? { name: addPretenderPrefillName } : null}
          defaultCity={profile?.city || "Toronto"}
          onClose={() => { setAddPretender(false); setAddPretenderPrefillName(""); }}
          onSubmit={(cid, entry) => addToPretenders(cid, entry)}
        />
      )}

      {profile && !profile.onboarded && (
        <WelcomeModal
          profile={profile}
          onChangeAvatar={(avatar_url) => handleUpdateProfile({ avatar_url })}
          onSubmit={(fields) => handleUpdateProfile({ ...fields, onboarded: true })}
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
          onChangeAvatar={(avatar_url) => handleUpdateProfile({ avatar_url })}
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

function PretenderCard({ p, selectableCuisines, onRemove, onChangeNote, onChangeCuisine, onChangePhotos, onToggleVisited, onChangeVerdict, onCrown, userId, friendMatches }) {
  return (
    <div className="mb-3 rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, opacity: p.visitedAt ? 0.7 : 1 }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-lg" style={{ ...display, fontWeight: 700 }}>
            {p.name}
            {p.visitedAt && <Check size={14} style={{ color: C.green }} />}
            {p.verdict && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                style={p.verdict === "worth_it" ? { background: C.green + "22", color: C.green } : { background: C.cardEdge, color: C.muted }}
              >
                {p.verdict === "worth_it" ? "Worth it" : "Not for me"}
              </span>
            )}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs" style={{ color: C.muted }}>
            {(p.area || p.address) && <><MapPin size={11} /> {p.area || p.address}</>}
            {p.rating && <><Star size={11} style={{ color: C.gold }} fill={C.gold} /> {p.rating}</>}
            {p.mapsUrl && <a href={p.mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 font-semibold" style={{ color: C.gold }}>Map <ExternalLink size={10} /></a>}
          </div>
        </div>
        <button onClick={() => onRemove(p.id)} aria-label="Remove" style={{ color: C.muted }}><Trash2 size={15} /></button>
      </div>
      {friendMatches && friendMatches.length > 0 && (
        <div className="mt-2 rounded-lg p-2.5" style={{ background: C.bg, border: `1px dashed ${C.gold}66` }}>
          {friendMatches.slice(0, 2).map((m, i) => (
            <p key={i} className="text-xs leading-relaxed" style={{ color: C.cream + "CC" }}>
              {m.crowned ? <Crown size={11} className="mr-1 inline" style={{ color: C.gold }} /> : <Check size={11} className="mr-1 inline" style={{ color: C.green }} />}
              <strong>{m.friend}</strong>{m.crowned ? ` crowned this for ${m.cuisine}` : "'s been"}
              {m.verdict && <> - <span style={{ color: m.verdict === "worth_it" ? C.green : C.muted, fontWeight: 700 }}>{m.verdict === "worth_it" ? "Worth it" : "Not for me"}</span></>}
              {m.text && <>: &ldquo;{m.text}&rdquo;</>}
            </p>
          ))}
          {friendMatches.length > 2 && (
            <p className="text-xs" style={{ color: C.muted }}>+{friendMatches.length - 2} more from your Court</p>
          )}
        </div>
      )}
      <textarea
        key={p.id + (p.note || "")}
        defaultValue={p.note || ""}
        onBlur={(e) => { if (e.target.value !== (p.note || "")) onChangeNote(p.id, e.target.value.trim()); }}
        placeholder={p.visitedAt ? "Write a review - visible to friends who follow you" : "Note (optional, private until you've been)"}
        rows={2}
        className="mt-2 w-full rounded-lg px-3 py-2 text-sm italic outline-none"
        style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
      />
      {p.visitedAt && onChangeVerdict && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => onChangeVerdict(p.id, p.verdict === "worth_it" ? null : "worth_it")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
            style={p.verdict === "worth_it" ? { background: C.green + "22", color: C.green, border: `1px solid ${C.green}66` } : { color: C.muted, border: `1px solid ${C.cardEdge}` }}
          >
            <Check size={13} /> Worth it
          </button>
          <button
            onClick={() => onChangeVerdict(p.id, p.verdict === "not_for_me" ? null : "not_for_me")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
            style={p.verdict === "not_for_me" ? { background: C.cardEdge, color: C.cream, border: `1px solid ${C.cardEdge}` } : { color: C.muted, border: `1px solid ${C.cardEdge}` }}
          >
            <X size={13} /> Not for me
          </button>
        </div>
      )}
      <select
        value={p.cuisineId || ""}
        onChange={(e) => onChangeCuisine(p.id, e.target.value)}
        className="mt-2 rounded px-2 py-1 text-xs outline-none"
        style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: p.cuisineId ? C.cream : C.muted }}
      >
        <option value="">Uncategorized</option>
        {selectableCuisines.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {p.visitedAt && <PhotoPicker userId={userId} photos={p.photos || []} onChange={(photos) => onChangePhotos(p.id, photos)} />}
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

function Avatar({ url, size = 28 }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size, border: `1px solid ${C.cardEdge}` }} />
  ) : (
    <div className="flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, background: C.card, border: `1px solid ${C.cardEdge}`, color: C.muted }}>
      <Users size={Math.round(size * 0.55)} />
    </div>
  );
}

// One photo, always the same storage path (a re-upload overwrites it),
// with a small camera badge to invite changing it - distinct from
// PhotoPicker below, which manages up to 3 photos on a review.
function AvatarPicker({ userId, url, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true); setErr("");
    try {
      onChange(await uploadAvatar(userId, file));
    } catch (e2) {
      setErr(e2.message || "Couldn't upload that photo.");
    }
    setUploading(false);
  };

  return (
    <div className="flex flex-col items-center">
      <label className="relative cursor-pointer">
        <Avatar url={url} size={72} />
        <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: C.gold, color: C.bg, border: `2px solid ${C.card}` }}>
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
        </span>
        <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} className="hidden" />
      </label>
      {err && <p className="mt-1 text-xs" style={{ color: C.coup }}>{err}</p>}
    </div>
  );
}

// Read-only thumbnail row - used both for the owner's own picks (paired
// with PhotoPicker below) and for reading a friend's or a public profile's
// photos, where no remove button applies.
function PhotoStrip({ photos, onRemove }) {
  const [viewing, setViewing] = useState(null);
  if (!photos || photos.length === 0) return null;
  return (
    <>
      <div className="mt-2 flex gap-2">
        {photos.map((url, i) => (
          <div key={url} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg" style={{ border: `1px solid ${C.cardEdge}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" onClick={() => setViewing(url)} className="h-full w-full cursor-pointer object-cover" />
            {onRemove && (
              <button onClick={() => onRemove(i)} aria-label="Remove photo" className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>
                <X size={10} />
              </button>
            )}
          </div>
        ))}
      </div>
      {viewing && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center p-5" style={{ background: "rgba(10,5,16,0.92)" }} onClick={() => setViewing(null)}>
          <button onClick={() => setViewing(null)} aria-label="Close" className="absolute right-4 top-4" style={{ color: C.cream }}><X size={24} /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewing} alt="" className="max-h-full max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}

// Uploads happen the moment a photo is picked, not deferred to some later
// "save" - simpler state, and it means a review's photos are never lost to
// a closed tab mid-edit. Removing one is a local array change the caller
// persists (immediately for an existing review, or on submit for a new one).
function PhotoPicker({ userId, photos, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_REVIEW_PHOTOS - photos.length);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true); setErr("");
    try {
      const urls = [];
      for (const file of files) urls.push(await uploadReviewPhoto(userId, file));
      onChange([...photos, ...urls]);
    } catch (e2) {
      setErr(e2.message || "Couldn't upload that photo.");
    }
    setUploading(false);
  };

  return (
    <div className="mt-2">
      <PhotoStrip photos={photos} onRemove={(i) => { deleteReviewPhoto(photos[i]); onChange(photos.filter((_, idx) => idx !== i)); }} />
      {photos.length < MAX_REVIEW_PHOTOS && (
        <label className="mt-2 flex w-fit cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}>
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
          {uploading ? "Uploading..." : `Add photo (${photos.length}/${MAX_REVIEW_PHOTOS})`}
          <input type="file" accept="image/*" multiple onChange={handleFiles} disabled={uploading} className="hidden" />
        </label>
      )}
      {err && <p className="mt-1 text-xs" style={{ color: C.coup }}>{err}</p>}
    </div>
  );
}

function ThroneCard({ cuisineName, cuisineId, slot, featured, historyOpen, setHistoryOpen, setModal, sharePick, fmt, emptyCuisines, onMoveCuisine, onUnCrown, onEditDecree, onEditPhotos, onHide, userId }) {
  const r = slot?.current;
  const fallenList = slot?.fallen || [];
  const open = historyOpen[cuisineName];

  // One edit panel covers both the decree text and the cuisine it's filed
  // under - these used to be two separate buttons ("Edit review" and "Wrong
  // category?"), which just meant hunting for the right one. A pencil icon
  // reads as "edit" on its own, so there's no need to spell it out either.
  const [editing, setEditing] = useState(false);
  const [decreeText, setDecreeText] = useState("");
  const [targetCuisineId, setTargetCuisineId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const startEdit = () => {
    setDecreeText(r.decree);
    setTargetCuisineId(cuisineId || "");
    setSaveErr("");
    setEditing(true);
  };

  const confirmEdit = async () => {
    if (decreeText.trim().length < 30 || saving) return;
    setSaving(true); setSaveErr("");
    try {
      if (onEditDecree && decreeText.trim() !== r.decree) await onEditDecree(decreeText.trim());
      if (onMoveCuisine && targetCuisineId && targetCuisineId !== cuisineId) await onMoveCuisine(targetCuisineId);
      setEditing(false);
    } catch (e) {
      setSaveErr(e.message || "Couldn't save that.");
    }
    setSaving(false);
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
        {editing ? (
          <div className="mt-2">
            <textarea
              autoFocus
              value={decreeText}
              onChange={(e) => setDecreeText(e.target.value)}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
            />
            <div className="mt-1 text-xs" style={{ color: decreeText.trim().length < 30 ? C.coup : C.muted }}>{decreeText.trim().length}/30 minimum</div>
            {onMoveCuisine && (
              <div className="mt-2">
                <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Cuisine</label>
                <select value={targetCuisineId} onChange={(e) => setTargetCuisineId(e.target.value)} className="mt-1 w-full rounded-lg px-2 py-1.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }}>
                  <option value={cuisineId}>{cuisineName} (current)</option>
                  {(emptyCuisines || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {saveErr && <p className="mt-1 text-xs" style={{ color: C.coup }}>{saveErr}</p>}
            <div className="mt-2 flex gap-2">
              <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}>Cancel</button>
              <button disabled={decreeText.trim().length < 30 || saving} onClick={confirmEdit} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={decreeText.trim().length >= 30 ? { background: C.gold, color: C.bg } : { background: C.cardEdge, color: C.muted }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm leading-relaxed" style={{ color: C.cream + "E6" }}>
            <ScrollText size={13} className="mr-1 inline" style={{ color: C.gold }} />{r.decree}
            {(onEditDecree || onMoveCuisine) && (
              <button onClick={startEdit} aria-label="Edit" title="Edit" className="ml-1.5 inline-flex align-middle rounded p-1" style={{ color: C.muted }}>
                <Pencil size={12} />
              </button>
            )}
          </p>
        )}
        {onEditPhotos && <PhotoPicker userId={userId} photos={r.photos || []} onChange={(photos) => onEditPhotos(photos)} />}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => setModal({ cuisineId, cuisineName, mode: "coup" })} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.coup + "22", color: C.coup, border: `1px solid ${C.coup}66` }}><Swords size={13} /> Coup</button>
          <button onClick={() => sharePick(cuisineName, r)} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}><Share2 size={13} /> Share</button>
          {onUnCrown && (
            <button onClick={onUnCrown} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}><RotateCcw size={13} /> Un-crown</button>
          )}
          {fallenList.length > 0 && <button onClick={() => setHistoryOpen((p) => ({ ...p, [cuisineName]: !p[cuisineName] }))} className="flex items-center gap-1 px-1 text-xs font-semibold" style={{ color: C.muted }}>{fallenList.length} fallen {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>}
        </div>
        {open && fallenList.map((f, i) => (
          <div key={i} className="mt-2 rounded-lg p-3 text-xs" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
            <div className="font-bold" style={{ color: C.muted }}>{f.name} <span className="font-normal">· reigned until {fmt(f.dethronedAt)}</span></div>
            <p className="mt-1 italic" style={{ color: C.muted }}>&ldquo;{f.decree}&rdquo;</p>
          </div>))}
      </div>) : (<div className="mt-2">
        <p className="text-sm italic" style={{ color: C.muted }}>{featured ? "No overall favourite crowned yet." : "This throne sits empty."}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => setModal({ cuisineId, cuisineName, mode: "claim" })} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.gold, color: C.bg }}><Crown size={13} /> {featured ? "Crown your favourite" : "Crown a spot"}</button>
          {onHide && (
            <button onClick={onHide} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}><X size={13} /> Hide this cuisine</button>
          )}
        </div>
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

// Illustrative only - no real user's data. Cold traffic (a stranger from
// Instagram, say) has nothing to judge the product by otherwise; a made-up
// but concrete-looking kingdom does more work than another sentence of
// description, without needing an actual account's screenshots.
const EXAMPLE_THRONES = [
  { cuisine: "PIZZA", name: "Pizzeria Libretto", note: "Best margherita in the city, hands down." },
  { cuisine: "RAMEN", name: "Sakura House", note: "Rich tonkotsu broth that never misses." },
  { cuisine: "TACOS", name: "El Fuego", note: "Al pastor that ruined every other taco for me." },
];

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
      <div className="flex min-h-screen flex-col items-center px-5 py-10">
        <div className="w-full max-w-sm rounded-2xl p-7 text-center" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
          <div className="flex items-center justify-center gap-2">
            <LogoMark size={28} />
            <h1 className="text-2xl tracking-[0.12em]" style={{ ...display, fontWeight: 900 }}>NOMARCHY</h1>
          </div>
          <p className={`mt-1 text-sm italic ${sent ? "mb-6" : ""}`} style={{ ...display, color: C.muted }}>Long live your favourites.</p>

          {!sent && (
            <p className="mb-6 mt-3 text-xs leading-relaxed" style={{ color: C.muted }}>
              Crown your favourite spot in every cuisine. When something better comes along, stage a coup. Compare your kingdom with friends, and climb the ranks as your picks earn trust. Already keep a list of favourites? Paste the whole thing in once you&apos;re signed in and we&apos;ll sort it out.
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
                style={{ background: C.gold, color: C.bg }}
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
                <button type="submit" disabled={submitting} className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold" style={{ background: "transparent", color: C.cream, border: `1px solid ${C.cardEdge}` }}>
                  {submitting ? <Loader2 size={15} className="animate-spin" /> : <Crown size={15} />}
                  {submitting ? "Sending..." : "Send sign-in code"}
                </button>
              </form>
            </div>
          )}
          <p className="mt-5 text-center text-xs" style={{ color: C.muted }}>
            By continuing, you agree to our{" "}
            <Link href="/terms" style={{ color: C.muted, textDecoration: "underline" }}>Terms</Link> and{" "}
            <Link href="/privacy" style={{ color: C.muted, textDecoration: "underline" }}>Privacy Policy</Link>.
          </p>
        </div>

        <div className="mt-10 w-full max-w-sm">
          <p className="text-center text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.14em" }}>See it in action</p>

          <p className="mb-2 mt-5 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>Your kingdom</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {EXAMPLE_THRONES.map((t) => (
              <div key={t.cuisine} className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.gold}55` }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>{t.cuisine}</span>
                  <Crown size={13} style={{ color: C.gold }} fill={C.gold} strokeWidth={0} />
                </div>
                <p className="mt-1.5 text-sm" style={{ ...display, fontWeight: 700 }}>{t.name}</p>
                <p className="mt-1 text-xs italic leading-snug" style={{ color: C.muted }}>&ldquo;{t.note}&rdquo;</p>
              </div>
            ))}
          </div>

          <p className="mb-2 mt-5 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>A coup in progress</p>
          <div className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
            <div className="flex items-center justify-between opacity-60">
              <div>
                <span className="text-[10px] font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>Reigning &mdash; Pizza</span>
                <p className="text-sm" style={{ ...display, fontWeight: 700, textDecoration: "line-through" }}>Mario&rsquo;s Pizzeria</p>
              </div>
              <Crown size={16} style={{ color: C.muted }} />
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase" style={{ color: C.gold, letterSpacing: "0.1em" }}>Challenger</span>
                <p className="text-sm" style={{ ...display, fontWeight: 700 }}>Pizzeria Libretto</p>
              </div>
              <span className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold" style={{ background: C.gold, color: C.bg }}>
                <Crown size={12} /> Crown it
              </span>
            </div>
          </div>

          <p className="mt-4 text-center text-[11px] italic" style={{ color: C.muted }}>
            Example kingdom shown &mdash; yours starts empty, waiting for your first pick.
          </p>
        </div>
      </div>
    </FontShell>
  );
}

// One-time, non-dismissable first-run step - a brand new signup (email
// or Google) lands with an auto-generated username like "steve-8f3a"
// that reads fine internally but poorly to a cold Instagram contact.
// Pre-filling the cleaned-up slug (stripping the random suffix the
// handle_new_user() trigger appends) means most people can just tap
// Continue, while anyone who cares can still change it right here.
function WelcomeModal({ profile, onChangeAvatar, onSubmit }) {
  const suggested = (profile?.username || "").replace(/-[0-9a-f]{4}$/, "");
  const [username, setUsername] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const usernameValid = /^[a-z0-9-]{3,30}$/.test(username.trim().toLowerCase());

  const save = async () => {
    if (!usernameValid || busy) return;
    setBusy(true); setErr("");
    try {
      await onSubmit({ username: username.trim().toLowerCase() });
    } catch (e) {
      setErr(e.message || "Couldn't save. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-5" style={{ background: "rgba(10,5,16,0.92)" }}>
      <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
        <Crown size={30} className="mx-auto" style={{ color: C.gold }} fill={C.gold} strokeWidth={0} />
        <h2 className="mt-2 text-xl" style={{ ...display, fontWeight: 900 }}>Welcome to Nomarchy</h2>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>Long live your favourites. First, make this yours.</p>

        <div className="mt-4 flex justify-center">
          <AvatarPicker userId={profile?.id} url={profile?.avatar_url} onChange={onChangeAvatar} />
        </div>

        <div className="mt-4 text-left">
          <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Username</label>
          <input
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="lowercase, letters/numbers/hyphens"
            className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
          />
          <div className="mt-1 text-xs" style={{ color: usernameValid || !username ? C.muted : C.coup }}>
            This is what friends use to follow you (@{username.trim().toLowerCase() || "username"}).
          </div>
        </div>

        {err && <p className="mt-3 text-xs" style={{ color: C.coup }}>{err}</p>}

        <button
          disabled={!usernameValid || busy}
          onClick={save}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold"
          style={usernameValid ? { background: C.gold, color: C.bg } : { background: C.cardEdge, color: C.muted }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          Continue
        </button>

        <Link href="/faq" className="mt-3 block text-center text-xs font-semibold" style={{ color: C.muted }}>
          Curious how it all works? Read the FAQ
        </Link>
      </div>
    </div>
  );
}

function ProfileModal({ profile, title, rank, nextRank, score, stats, onClose, onSubmit, onChangeAvatar, onDeleteAccount }) {
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState(profile?.username || "");
  const [city, setCity] = useState(profile?.city || "");
  const [isPublic, setIsPublic] = useState(profile?.is_public ?? true);
  const [discoverable, setDiscoverable] = useState(profile?.discoverable ?? false);
  const [remindersOn, setRemindersOn] = useState(!(profile?.reminders_opt_out ?? false));
  const [notifyFollows, setNotifyFollows] = useState(profile?.notify_follows ?? true);
  const [notifyCrowns, setNotifyCrowns] = useState(profile?.notify_crowns ?? true);
  const [notifyReviews, setNotifyReviews] = useState(profile?.notify_reviews ?? true);
  const [notifyEndorsements, setNotifyEndorsements] = useState(profile?.notify_endorsements ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  const [providers, setProviders] = useState(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState("");

  useEffect(() => {
    getLinkedProviders().then(setProviders).catch(() => setProviders([]));
  }, []);
  const googleLinked = providers?.includes("google");

  const toggleGoogle = async () => {
    setLinkBusy(true); setLinkErr("");
    try {
      if (googleLinked) {
        await unlinkGoogle();
        setProviders((p) => p.filter((x) => x !== "google"));
      } else {
        await linkGoogle(); // redirects away and back - nothing to update here on success
      }
    } catch (e) {
      setLinkErr(e.message || "Couldn't update that.");
    }
    setLinkBusy(false);
  };

  const usernameValid = /^[a-z0-9-]{3,30}$/.test(username.trim().toLowerCase());
  const deleteConfirmed = deleteText.trim().toLowerCase() === profile?.username?.toLowerCase();

  const save = async () => {
    if (!usernameValid || busy) return;
    setBusy(true); setErr("");
    try {
      await onSubmit({
        username: username.trim().toLowerCase(), city: city.trim() || null, is_public: isPublic, discoverable, reminders_opt_out: !remindersOn,
        notify_follows: notifyFollows, notify_crowns: notifyCrowns, notify_reviews: notifyReviews, notify_endorsements: notifyEndorsements,
      });
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
    <div className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-3" style={{ background: C.card, borderBottom: `1px solid ${C.cardEdge}` }}>
          <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>Your profile</h3>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center" style={{ color: C.muted }}><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 pb-5">
        <div className="mt-3">
          <AvatarPicker userId={profile?.id} url={profile?.avatar_url} onChange={onChangeAvatar} />
        </div>
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
            className="relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors"
            style={{ background: isPublic ? C.gold : C.cardEdge }}
          >
            <span
              className="absolute left-0 top-0.5 h-5 w-5 rounded-full transition-transform"
              style={{ background: C.bg, transform: isPublic ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div className="flex items-start gap-2">
            <Search size={16} className="mt-0.5 shrink-0" style={{ color: discoverable ? C.gold : C.muted }} />
            <div>
              <div className="text-sm font-semibold">Discoverable</div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>
                Show up in Find People for anyone to browse and follow - separate from Public/Private above,
                which only controls who can see your kingdom if they already have your link.
              </div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={discoverable}
            onClick={() => setDiscoverable((v) => !v)}
            className="relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors"
            style={{ background: discoverable ? C.gold : C.cardEdge }}
          >
            <span
              className="absolute left-0 top-0.5 h-5 w-5 rounded-full transition-transform"
              style={{ background: C.bg, transform: discoverable ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div className="flex items-start gap-2">
            <Mail size={16} className="mt-0.5 shrink-0" style={{ color: remindersOn ? C.gold : C.muted }} />
            <div>
              <div className="text-sm font-semibold">Inactivity reminders</div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>
                A nudge by email if your kingdom&apos;s been quiet for a month - no sign-in, or nothing new crowned.
              </div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={remindersOn}
            onClick={() => setRemindersOn((v) => !v)}
            className="relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors"
            style={{ background: remindersOn ? C.gold : C.cardEdge }}
          >
            <span
              className="absolute left-0 top-0.5 h-5 w-5 rounded-full transition-transform"
              style={{ background: C.bg, transform: remindersOn ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>

        <div className="mt-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>Notify me about</div>
          {[
            ["New followers", notifyFollows, setNotifyFollows],
            ["New crowns from Court", notifyCrowns, setNotifyCrowns],
            ["New reviews from Court", notifyReviews, setNotifyReviews],
            ["Endorsements on my picks", notifyEndorsements, setNotifyEndorsements],
          ].map(([label, value, setValue]) => (
            <div key={label} className="mt-2 flex items-center justify-between gap-3">
              <span className="text-sm">{label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={value}
                onClick={() => setValue((v) => !v)}
                className="relative h-5 w-9 shrink-0 overflow-hidden rounded-full transition-colors"
                style={{ background: value ? C.gold : C.cardEdge }}
              >
                <span
                  className="absolute left-0 top-0.5 h-4 w-4 rounded-full transition-transform"
                  style={{ background: C.bg, transform: value ? "translateX(18px)" : "translateX(2px)" }}
                />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div>
            <div className="text-sm font-semibold">Appearance</div>
            <div className="mt-0.5 text-xs" style={{ color: C.muted }}>{theme === "light" ? "Light" : "Dark"} mode</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={theme === "light"}
            onClick={toggleTheme}
            className="relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors"
            style={{ background: theme === "light" ? C.gold : C.cardEdge }}
          >
            <span
              className="absolute left-0 top-0.5 h-5 w-5 rounded-full transition-transform"
              style={{ background: C.bg, transform: theme === "light" ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div className="flex items-center gap-2">
            <GoogleIcon size={18} />
            <div>
              <div className="text-sm font-semibold">Google sign-in</div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>
                {providers === null ? "Checking..." : googleLinked ? "Connected - you can sign in with either method." : "Not connected yet."}
              </div>
            </div>
          </div>
          {providers !== null && (
            <button
              type="button"
              onClick={toggleGoogle}
              disabled={linkBusy}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
              style={googleLinked ? { color: C.muted, border: `1px solid ${C.cardEdge}` } : { background: C.gold, color: C.bg }}
            >
              {linkBusy ? <Loader2 size={13} className="animate-spin" /> : null}
              {googleLinked ? "Unlink" : "Link"}
            </button>
          )}
        </div>
        {linkErr && <p className="mt-1.5 text-xs" style={{ color: C.coup }}>{linkErr}</p>}

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

        <Link href="/faq" className="mt-4 block text-center text-xs font-semibold" style={{ color: C.muted }}>
          How Nomarchy works
        </Link>

        <a
          href="https://www.instagram.com/nomarchyapp"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold"
          style={{ color: C.muted }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
          Follow @nomarchyapp
        </a>

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

function PersonRow({ p, onFollow, busy, hint }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderTop: `1px solid ${C.cardEdge}` }}>
      <div className="flex items-center gap-2">
        <Avatar url={p.avatarUrl} size={28} />
        <div>
          <div className="text-sm font-semibold">{p.name}</div>
          <div className="text-xs" style={{ color: C.muted }}>
            @{p.username}{hint ? ` · ${hint}` : ""}
          </div>
        </div>
        {p.isOwner && <OwnerBadge size={12} />}
      </div>
      {p.alreadyFollowing ? (
        <span className="text-xs font-semibold" style={{ color: C.muted }}>Following</span>
      ) : (
        <button
          onClick={() => onFollow(p)}
          disabled={busy}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
          style={{ background: C.gold, color: C.bg }}
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />} Follow
        </button>
      )}
    </div>
  );
}

// A friend's full kingdom, in its own dismissable modal rather than
// expanding inline in the Court list - inline worked fine for a handful
// of thrones, but someone with a long history of picks and reviews would
// turn the whole Court tab into one giant scroll, burying every other
// friend below them.
function FriendKingdomModal({ friend: f, onClose, onEndorse, onAddToList }) {
  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Avatar url={f.avatarUrl} size={36} />
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
          </div>
          <button onClick={onClose} aria-label="Close" style={{ color: C.muted }}><X size={18} /></button>
        </div>

        {f.picks.length === 0 && f.reviews.length === 0 && <p className="mt-4 text-sm" style={{ color: C.muted }}>No thrones claimed yet.</p>}

        {f.picks.map((p) => (
          <div key={p.id} className="mt-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
            <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>{p.cuisine}</div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <div><span style={{ ...display, fontWeight: 700 }} className="text-base">{p.name}</span><span className="ml-2 text-xs" style={{ color: C.muted }}>{p.area}</span></div>
              <button onClick={() => onEndorse(p.id, p.endorsedByMe)} className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
                style={p.endorsedByMe ? { background: C.gold, color: C.bg } : { border: `1px solid ${C.cardEdge}`, color: C.muted }}>
                <Crown size={12} /> {p.endorsedByMe ? "Endorsed" : "Endorse"}
              </button>
            </div>
            <p className="mt-1.5 text-sm italic leading-relaxed" style={{ color: C.cream + "CC" }}>&ldquo;{p.decree}&rdquo;</p>
            <PhotoStrip photos={p.photos} />
            <button onClick={() => onAddToList(f.name, p)}
              className="mt-2 flex items-center gap-1.5 text-xs font-bold" style={{ color: C.gold }}><Bookmark size={12} /> Add to my list</button>
          </div>
        ))}

        {f.reviews.length > 0 && (
          <div className="mt-4 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Been to, not crowned</div>
        )}
        {f.reviews.map((r) => (
          <div key={r.id} className="mt-2 rounded-lg p-3" style={{ background: C.bg, border: `1px dashed ${C.cardEdge}` }}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5" style={{ ...display, fontWeight: 700 }}>
                <span className="text-sm">{r.name}</span>
                {r.verdict && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={r.verdict === "worth_it" ? { background: C.green + "22", color: C.green } : { background: C.cardEdge, color: C.muted }}
                  >
                    {r.verdict === "worth_it" ? "Worth it" : "Not for me"}
                  </span>
                )}
              </span>
              <span className="text-xs" style={{ color: C.muted }}>{[r.cuisine, r.area].filter(Boolean).join(" · ")}</span>
            </div>
            {r.note && <p className="mt-1 text-sm italic leading-relaxed" style={{ color: C.cream + "CC" }}>&ldquo;{r.note}&rdquo;</p>}
            <PhotoStrip photos={r.photos} />
          </div>
        ))}
      </div>
    </div>
  );
}

function MembersModal({ userId, onFollow, onClose }) {
  const [suggested, setSuggested] = useState(null);
  const [members, setMembers] = useState(null);
  const [err, setErr] = useState("");
  const [followBusy, setFollowBusy] = useState(null);

  useEffect(() => {
    loadSuggestedFriends(userId).then(setSuggested).catch(() => setSuggested([]));
    loadDirectory(userId).then(setMembers).catch((e) => setErr(e.message || "Couldn't load members."));
  }, [userId]);

  const follow = async (p) => {
    setFollowBusy(p.id);
    try {
      await onFollow(p.id);
      const mark = (list) => list.map((x) => (x.id === p.id ? { ...x, alreadyFollowing: true } : x));
      setSuggested((prev) => prev && mark(prev));
      setMembers((prev) => prev && mark(prev));
    } catch (e) {
      setErr(e.message || "Couldn't follow");
    }
    setFollowBusy(null);
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>Find people</h3>
          <button onClick={onClose} aria-label="Close" style={{ color: C.muted }}><X size={18} /></button>
        </div>

        {err && <p className="mt-3 text-xs" style={{ color: C.coup }}>{err}</p>}

        {suggested && suggested.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-bold uppercase" style={{ color: C.gold, letterSpacing: "0.1em" }}>Suggested for you</div>
            <p className="mt-0.5 text-xs" style={{ color: C.muted }}>People your Court already follows.</p>
            <div className="mt-1">
              {suggested.map((p) => (
                <PersonRow key={p.id} p={p} onFollow={follow} busy={followBusy === p.id}
                  hint={`${p.mutualCount} mutual${p.mutualCount === 1 ? "" : "s"}`} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-4">
          <div className="text-xs font-bold uppercase" style={{ color: C.gold, letterSpacing: "0.1em" }}>Public profiles</div>
          <p className="mt-0.5 text-xs" style={{ color: C.muted }}>People who&apos;ve chosen to be discoverable by anyone.</p>
          {!members && <p className="mt-3 text-sm" style={{ color: C.muted }}>Loading...</p>}
          {members?.length === 0 && <p className="mt-3 text-sm" style={{ color: C.muted }}>No one&apos;s opted into this yet.</p>}
          <div className="mt-1">
            {members?.map((p) => (
              <PersonRow key={p.id} p={p} onFollow={follow} busy={followBusy === p.id} />
            ))}
          </div>
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
    <div className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
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

function PlaceModal({ mode, cuisineId, cuisineName, cuisines, prefill, reigning, defaultCity, userId, onClose, onSubmit }) {
  const isCoup = mode === "coup"; const isPretender = mode === "pretender";
  const [cz, setCz] = useState(cuisineId);
  const [query, setQuery] = useState(prefill?.name || "");
  const [city, setCity] = useState(defaultCity || "Toronto");
  const [results, setResults] = useState([]);
  const [fuzzy, setFuzzy] = useState(false);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(prefill?.mapsUrl ? prefill : null);
  const [name, setName] = useState(prefill?.name || "");
  const [area, setArea] = useState(prefill?.area || "");
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState(prefill?.photos || []);
  const [submitting, setSubmitting] = useState(false);
  const minLen = isPretender ? 0 : MIN_DECREE_LENGTH;
  const valid = name.trim().length > 1 && text.trim().length >= minLen && !!cz;
  const czName = cuisines.find((c) => c.id === cz)?.name || cuisineName;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true); setErr("");
    try {
      await onSubmit(cz, { name: name.trim().toUpperCase(), area: area.trim(), ...(isPretender ? { note: text.trim() } : { decree: text.trim(), photos }), address: sel?.address || "", rating: sel?.rating || "", mapsUrl: sel?.mapsUrl || "" });
    } catch (e) {
      setErr(e.message || "That didn't save - try again.");
    }
    setSubmitting(false);
  };

  const find = async () => {
    if (!query.trim() || searching) return;
    setSearching(true); setErr(""); setResults([]); setFuzzy(false); setSel(null);
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
      if (Array.isArray(data.results) && data.results.length) {
        setResults(data.results.slice(0, 3));
        setFuzzy(!!data.fuzzy);
      } else {
        setErr("No matches found. Fill in the details manually below.");
      }
    } catch (e) {
      setErr(e.message || "Lookup didn't work. Fill in the details manually below.");
    }
    setSearching(false);
  };

  const choose = (r) => { setSel(r); setName(r.name || ""); setArea(r.neighbourhood || ""); setResults([]); setFuzzy(false); };

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
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
          {fuzzy && results.length > 0 && (
            <p className="mt-2 text-xs font-bold uppercase" style={{ color: C.gold, letterSpacing: "0.1em" }}>Did you mean?</p>
          )}
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
        {!isPretender && <PhotoPicker userId={userId} photos={photos} onChange={setPhotos} />}

        <button disabled={!valid || submitting} onClick={handleSubmit}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold"
          style={valid && !submitting ? { background: isCoup ? C.coup : C.gold, color: isCoup ? C.cream : C.bg } : { background: C.cardEdge, color: C.muted }}>
          {submitting ? <Loader2 size={15} className="animate-spin" /> : isPretender ? <Bookmark size={15} /> : isCoup ? <Swords size={15} /> : <Crown size={15} />}
          {submitting ? "Saving..." : isPretender ? "Add to Next in Line" : isCoup ? "Dethrone and crown" : "Crown this spot"}
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
    <div className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
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
