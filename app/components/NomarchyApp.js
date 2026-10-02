"use client";

import { useEffect, useRef, useState } from "react";
import Tour from "../Tour";
import dynamic from "next/dynamic";
import { getCuisineEmoji, setCuisineEmojis } from "../cuisineIcons";
import { C, FontShell, LogoMark, OwnerBadge, RANKS, RankBadge, body, display, getRank, getTitle, useTheme } from "../theme";
import { PretenderCard, ThroneCard } from "./Cards";
import { AdminSection, Avatar, CORNY_VISIT_NOTES, CuisineEmojiGrid, GOOGLE_USAGE_LABELS, NOW, OVERALL_FAVOURITE_NAME, RANGE_MS, RestaurantRow, RowSkeleton, Skeleton, sameRestaurant, timeAgo } from "./shared";
import { A11Y_DEFAULTS, applyA11y, isDefaultA11y, normalizeA11y, readLocalA11y } from "@/lib/a11yPrefs";
import { addCuisine, addToNextInLine, blockUser, clearAppErrors, deleteAccount, dismissAllNotifications, dismissNotification, followByUsername, followUser, getProfile, importToNextInLine, loadA11yPrefs, loadAdminOverview, loadBestInLand, loadClosedPlaceIds, loadCourt, loadCuisineEmojis, loadCuisines, loadFollowers, loadKingdom, loadNextInLine, loadNotifications, loadStanding, loadTourSeen, logRankPromotion, markNotificationsSeen, markTourSeen, markVisited, moveThroneCuisine, placeKey, promoteToThrone, removeFromNextInLine, saveA11yPrefs, searchAllRestaurants, setCuisineEmoji, signOut, submitFeedback, supabase, toggleEndorsement, unCrown, updatePretenderCuisine, updatePretenderNote, updatePretenderPhotos, updatePretenderVerdict, updateProfile, updateThroneDecree, updateThroneLocation, updateThronePhotos } from "@/lib/data";
import { claimSignupSource } from "@/lib/signupSource";
import { rememberTourLocally, shouldAutoStartTour, tourSeenLocally } from "@/lib/tour";
import { Bell, Bookmark, Check, ChevronDown, ClipboardPaste, Crown, Loader2, LogOut, Moon, Navigation, Pencil, Plus, Search, Share2, ShieldCheck, Sun, TrendingUp, UserPlus, Users, X } from "lucide-react";

// Loaded on demand rather than with the first screen: pop-ups and the
// admin tools are only needed when opened (and are fetched quietly in
// the background soon after the app loads, so opening one is instant).
const PlaceModal = dynamic(() => import("./Modals").then((m) => m.PlaceModal));
const ImportModal = dynamic(() => import("./Modals").then((m) => m.ImportModal));
const FeedbackModal = dynamic(() => import("./Modals").then((m) => m.FeedbackModal));
const RestaurantProfileModal = dynamic(() => import("./Modals").then((m) => m.RestaurantProfileModal));
const FriendKingdomModal = dynamic(() => import("./Modals").then((m) => m.FriendKingdomModal));
const MembersModal = dynamic(() => import("./Modals").then((m) => m.MembersModal));
const WelcomeModal = dynamic(() => import("./Modals").then((m) => m.WelcomeModal));
const PromotionModal = dynamic(() => import("./Modals").then((m) => m.PromotionModal));
const ProfileModal = dynamic(() => import("./ProfileModal").then((m) => m.ProfileModal));
const FixThroneTool = dynamic(() => import("./AdminTools").then((m) => m.FixThroneTool));
const PlaceMatchTool = dynamic(() => import("./AdminTools").then((m) => m.PlaceMatchTool));
const ClosureCheckTool = dynamic(() => import("./AdminTools").then((m) => m.ClosureCheckTool));

// The Google map loader touches window/document, which breaks server-side
// rendering - ssr:false defers loading it until the browser actually
// needs it (i.e. someone switches the Kingdom tab to Map view).
const KingdomMap = dynamic(() => import("../KingdomMap"), { ssr: false });
const NextInLineMap = dynamic(() => import("../NextInLineMap"), { ssr: false });

export default function NomarchyApp({ user }) {
  // Subscribes this whole page to theme changes so it (and everything
  // under it) re-renders and picks up C's current values - theme/
  // toggleTheme now also power the header's own toggle, not just
  // Profile's labelled switch (see theme.js).
  const { theme, toggleTheme } = useTheme();
  const [profile, setProfile] = useState(null);

  const [tab, setTab] = useState("kingdom");
  const [slots, setSlots] = useState({});
  const [pretenders, setPretenders] = useState([]);
  const [cuisineList, setCuisineList] = useState([]);
  const [standing, setStanding] = useState(null);
  const [promotion, setPromotion] = useState(null);
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
  const [newCuisineEmoji, setNewCuisineEmoji] = useState("");
  const [pickingNewEmoji, setPickingNewEmoji] = useState(false);
  const [onlyCrowned, setOnlyCrowned] = useState(false);
  const [kingdomView, setKingdomView] = useState("grid");
  const [hiddenCuisinesOpen, setHiddenCuisinesOpen] = useState(false);
  const [nilView, setNilView] = useState("grid");
  // Next in Line shows one list at a time, and the Privy Council starts
  // folded away to a single line.
  const [nilList, setNilList] = useState("want");
  const [councilOpen, setCouncilOpen] = useState(false);
  const [nilCuisineFilter, setNilCuisineFilter] = useState("");
  const [pcCuisine, setPcCuisine] = useState("");
  const [pcIndex, setPcIndex] = useState(0);
  const [courtView, setCourtView] = useState("grid");
  const [courtDensity, setCourtDensity] = useState("expanded");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("nomarchy-court-density");
      if (saved === "compact" || saved === "expanded") setCourtDensity(saved);
    } catch {}
  }, []);
  const changeCourtDensity = (next) => {
    setCourtDensity(next);
    try { localStorage.setItem("nomarchy-court-density", next); } catch {}
  };
  const [adminData, setAdminData] = useState(null);
  const [adminError, setAdminError] = useState("");
  const [pretenderSearch, setPretenderSearch] = useState("");
  const [toast, setToast] = useState("");

  const [followInput, setFollowInput] = useState("");
  const [followBusy, setFollowBusy] = useState(false);
  const [followError, setFollowError] = useState("");

  const [editingProfile, setEditingProfile] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackPrefill, setFeedbackPrefill] = useState("");
  // First-time walkthrough (see Tour.js). Starts by itself once for new
  // accounts; anyone can replay it from Your Profile.
  const [tourOpen, setTourOpen] = useState(false);
  // Accessibility choices (Your Profile > Accessibility). Read from this
  // device straight away; the account's saved copy wins once loaded.
  const [a11y, setA11y] = useState(() => (typeof window === "undefined" ? { ...A11Y_DEFAULTS } : readLocalA11y()));
  const tourChecked = useRef(false);
  // Google place IDs the owner has confirmed as permanently closed.
  const [closedIds, setClosedIds] = useState(() => new Set());
  const [showMembers, setShowMembers] = useState(false);

  // Best in the Land: the ranked list for the current filters, and the
  // search results when something is typed in its search box (null = not searching).
  const [bestList, setBestList] = useState(null);
  const [bestSearchList, setBestSearchList] = useState(null);
  const [top25Error, setTop25Error] = useState("");
  const [top25City, setTop25City] = useState("");
  const [top25Range, setTop25Range] = useState("all");
  const [top25Locating, setTop25Locating] = useState(false);
  const [top25Scope, setTop25Scope] = useState("everyone");
  const [restaurantSearch, setRestaurantSearch] = useState("");
  const [openRestaurant, setOpenRestaurant] = useState(null);
  const [uncrownedMatches, setUncrownedMatches] = useState([]);

  // Debounced so typing doesn't fire a query per keystroke - this hits
  // the restaurants table directly rather than anything already loaded
  // client-side, since an uncrowned place has no throne row to search.
  useEffect(() => {
    const q = restaurantSearch.trim();
    if (!q) { setUncrownedMatches([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      searchAllRestaurants(q).then((rows) => { if (!cancelled) setUncrownedMatches(rows); }).catch(() => { if (!cancelled) setUncrownedMatches([]); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [restaurantSearch]);

  // Records which link a brand-new signup came from, once. Runs on every
  // sign-in but only does anything when there's a saved tag, and never
  // throws - it must not be able to get in the way of loading the app.
  // Fetch the pop-ups quietly in the background once the app is showing,
  // so opening one later is instant.
  useEffect(() => {
    const t = setTimeout(() => { import("./Modals"); import("./ProfileModal"); }, 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (user) claimSignupSource(supabase, user);
  }, [user?.id]);

  useEffect(() => {
    if (!user || !loaded || !profile?.onboarded || tourChecked.current) return;
    tourChecked.current = true;
    loadTourSeen(user.id).then((seen) => {
      if (shouldAutoStartTour({ createdAt: profile.created_at, onboarded: profile.onboarded, databaseOk: seen.databaseOk, seenAt: seen.seenAt, locallySeen: tourSeenLocally() })) {
        setTourOpen(true);
      }
    });
  }, [user?.id, loaded, profile?.onboarded]); // eslint-disable-line react-hooks/exhaustive-deps

  const endTour = () => {
    setTourOpen(false);
    setTab("kingdom");
    rememberTourLocally();
    if (user) markTourSeen(user.id);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [k, n, c, s, crt, flw, p, closed] = await Promise.all([
          loadKingdom(user.id),
          loadNextInLine(user.id),
          loadCuisines(user.id),
          loadStanding(user.id),
          loadCourt(user.id),
          loadFollowers(user.id),
          getProfile(user.id),
          loadClosedPlaceIds(),
        ]);
        setClosedIds(closed);
        const saved = await loadA11yPrefs(user.id);
        if (saved.databaseOk) {
          if (saved.prefs && Object.keys(saved.prefs).length > 0) {
            setA11y(applyA11y(saved.prefs));
          } else {
            // Nothing on the account yet: keep any choice made on this device.
            const local = readLocalA11y();
            if (!isDefaultA11y(local)) saveA11yPrefs(user.id, local);
          }
        }
        // Icons people picked for their own cuisines, so pins and cards show them.
        setCuisineEmojis(await loadCuisineEmojis());
        setSlots(k); setPretenders(n); setCuisineList(c);
        setStanding(s); setCourt(crt); setFollowers(flw); setProfile(p);
        const notifs = await loadNotifications(user.id, p.notifications_seen_at, p);
        setNotifications(notifs);
        setHasUnseenNotifications(notifs.some((n) => n.isNew));
      } catch (err) {
        setLoadError(err.message);
      }
      setLoaded(true);
    })();
  }, [user]);

  // Fires the promotion celebration whenever the live, computed rank is
  // higher than the last one this person was shown it for (last_rank_min,
  // backfilled in schema.sql so existing users don't get celebrated for a
  // rank they already held before this shipped). Persisting the new value
  // happens right away, not on close, so refreshing or closing the modal
  // before reading it can never bring it back on the next load.
  useEffect(() => {
    if (!profile || !standing) return;
    const currentRank = getRank(standing.score ?? 0);
    if (currentRank.min > 0 && currentRank.min > (profile.last_rank_min ?? 0)) {
      // Calmer celebrations: a short message instead of the full-screen takeover.
      if (a11y.calmCelebrations) flash(`You've been promoted to ${currentRank.title}`);
      else setPromotion(currentRank);
      handleUpdateProfile({ last_rank_min: currentRank.min }).catch(() => {});
      // Best-effort and independent of the line above - a friend never
      // seeing this in their feed shouldn't stop the celebration itself,
      // and vice versa.
      logRankPromotion(user.id, currentRank).catch(() => {});
    }
  }, [profile, standing]);

  // Long enough to read without rushing (2.2s was too quick for many
  // people) - or, if they've chosen it, it stays until they dismiss it.
  const flash = (m) => setToast(m);
  useEffect(() => {
    if (!toast || a11y.stickyMessages) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast, a11y.stickyMessages]);

  const updateA11y = (patch) => {
    const next = applyA11y(normalizeA11y({ ...a11y, ...patch }));
    setA11y(next);
    if (user) saveA11yPrefs(user.id, next);
  };

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

  // Re-ranks whenever a filter changes, after a short pause so typing in
  // the city or search box doesn't fire a request per letter. "Your Court"
  // counts your own crowns too.
  const courtIdsKey = user ? [...court.map((f) => f.id), user.id].sort().join(",") : "";
  useEffect(() => {
    if (tab !== "top25" || !user) return;
    let cancelled = false;
    const search = restaurantSearch.trim();
    const timer = setTimeout(async () => {
      try {
        const userIds = top25Scope === "friends" ? courtIdsKey.split(",") : null;
        if (search) {
          const found = await loadBestInLand({ search, userIds, limit: 50, closedIds });
          if (!cancelled) setBestSearchList(found);
        } else {
          const since = top25Range === "all" ? null : new Date(NOW - RANGE_MS[top25Range]).toISOString();
          const ranked = await loadBestInLand({ since, userIds, city: top25City.trim() || null, limit: 25, closedIds });
          if (!cancelled) { setBestList(ranked); setBestSearchList(null); }
        }
        if (!cancelled) setTop25Error("");
      } catch (e) {
        if (!cancelled) setTop25Error(e.message || "Couldn't load the leaderboard.");
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [tab, user, restaurantSearch, top25Scope, top25Range, top25City, courtIdsKey, closedIds]);

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

  const handleEditThroneLocation = async (throneId, location) => {
    await updateThroneLocation(throneId, location);
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
      googlePlaceId: throne.googlePlaceId,
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
    // Crowning removes a place from `pretenders`, so a restaurant already
    // holding a throne wouldn't show up in the check below on its own -
    // this is what let a friend's pick of something you'd already crowned
    // get added back as if it were new (e.g. via "Add to my list" on a
    // friend's pick that happens to be your own crowned place).
    const alreadyCrowned = Object.values(slots).some((s) => s.current && sameRestaurant(s.current.name, entry.name));
    if (alreadyCrowned) {
      throw new Error("Already crowned in your Kingdom");
    }
    const existingMatch = pretenders.find((p) => sameRestaurant(p.name, entry.name));
    if (existingMatch) {
      throw new Error(existingMatch.visitedAt ? "Already visited" : "Already Next in Line");
    }
    await addToNextInLine(user.id, { ...entry, cuisineId });
    await refreshPretenders();
    setAddPretender(false);
    flash(`${entry.name} is next in line`);
  };

  // Advances to a genuinely different pick whenever there's more than one
  // option, rather than tracking shown-history - a random offset of at
  // least 1 into the remaining pool guarantees it's never the same index
  // twice in a row without needing to remember what's already been shown.
  const handleAskCouncil = () => {
    setPcIndex((i) => (councilPool.length > 1 ? (i + 1 + Math.floor(Math.random() * (councilPool.length - 1))) % councilPool.length : 0));
  };

  const handleAddCouncilPick = async (pick) => {
    try {
      await addToPretenders(pick.cuisineId, { name: pick.name, area: pick.area, address: pick.address, city: pick.city, googlePlaceId: pick.googlePlaceId, lat: pick.lat, lng: pick.lng });
    } catch (e) {
      flash(e.message || "Couldn't add that.");
    }
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

  const handleToggleVisited = async (id, currentlyVisited, cuisineId, note, verdict) => {
    if (!currentlyVisited && !cuisineId) {
      flash("Pick a cuisine below first");
      return;
    }
    await markVisited(id, !currentlyVisited);
    if (!currentlyVisited && !note?.trim() && !verdict) {
      const corny = CORNY_VISIT_NOTES[Math.floor(Math.random() * CORNY_VISIT_NOTES.length)];
      await updatePretenderNote(id, corny);
    }
    await refreshPretenders();
  };

  // Bulk import: resolve each row's cuisine name to an existing id, or
  // create it. Sequential on purpose - two rows guessing the same brand
  // new cuisine must not both try to create it.
  const importMany = async (rows) => {
    let added = 0, skipped = 0;
    // Same blind spot as addToPretenders - a crowned place isn't in
    // `pretenders` anymore, so it needs its own check here too or a
    // re-import of an old list would re-add anything already crowned.
    const crownedNames = Object.values(slots).filter((s) => s.current).map((s) => s.current.name);
    const existingNames = [...pretenders.map((p) => p.name), ...crownedNames];
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

  // Shared by sharePick (a crowned throne) and sharePretender (a Next in
  // Line pick, shared to ask what friends think rather than to show off a
  // decree) - a native share sheet with the branded card image beats a
  // clipboard copy every time, people can post straight to a story or DM
  // it. Not every browser can share a file though (most desktop browsers
  // can't), so this always has the old copy-the-text behaviour to fall
  // back to.
  const shareCard = async (text, params, filename) => {
    const cardUrl = `/api/card?${params.toString()}`;
    try {
      const res = await fetch(cardUrl);
      const blob = await res.blob();
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Nomarchy", text });
        return;
      }
    } catch (e) {
      if (e?.name === "AbortError") return; // they closed the share sheet - not an error
    }

    try {
      await navigator.clipboard.writeText(text);
      flash("Copied, paste it in the group chat");
    } catch {
      flash("Couldn't copy on this device");
    }
  };

  const sharePick = (cuisineName, r) => {
    const text = `My ${cuisineName} throne on Nomarchy: ${r.name}${r.area ? ` (${r.area})` : ""}\n\n"${r.decree}"`;
    const params = new URLSearchParams({
      cuisine: cuisineName, name: r.name, area: r.area || "",
      rating: r.rating || "", blurb: r.decree || "", username: profile?.username || "",
    });
    return shareCard(text, params, "nomarchy-pick.png");
  };

  // Sharing something still on the shortlist, not yet crowned - framed as
  // "worth a visit?" so it reads as an invitation to discuss, not a
  // finished review.
  const sharePretender = (p) => {
    const text = `Thinking about trying this for ${p.cuisine || "something"}: ${p.name}${p.area ? ` (${p.area})` : ""} - worth a visit?${p.note ? `\n\n"${p.note}"` : ""}`;
    const params = new URLSearchParams({
      cuisine: p.cuisine || "", name: p.name, area: p.area || "",
      rating: p.rating || "", blurb: p.note || "", username: profile?.username || "", status: "considering",
    });
    return shareCard(text, params, "nomarchy-considering.png");
  };

  const sharePromotion = (rank) => {
    const text = `Just got promoted on Nomarchy: ${rank.title}!`;
    const params = new URLSearchParams({
      status: "promoted", rank: rank.title, blurb: (rank.proclamation || "").replace("{name}", profile?.display_name || profile?.username || ""),
      username: profile?.username || "",
    });
    return shareCard(text, params, "nomarchy-promotion.png");
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
      await addCuisine(user.id, v, newCuisineEmoji || undefined);
      setCuisineEmojis(await loadCuisineEmojis());
      await refreshCuisines();
    } catch (err) {
      flash(err.message);
    }
    setNewCuisine(""); setAddingCuisine(false); setNewCuisineEmoji(""); setPickingNewEmoji(false);
  };

  const handleChangeCuisineEmoji = async (cuisineId, emoji) => {
    try {
      await setCuisineEmoji(cuisineId, emoji);
      setCuisineEmojis(await loadCuisineEmojis());
      await refreshCuisines();
      flash("Icon updated");
    } catch (err) {
      flash(err.message || "Couldn't change that icon");
    }
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

  // Blocking removes the follow relationship both ways (enforced in
  // blockUser itself), so both Court and "following you" need refreshing,
  // not just Court.
  const handleBlockFriend = async (blockedId) => {
    await blockUser(user.id, blockedId);
    await Promise.all([refreshCourt(), loadFollowers(user.id).then(setFollowers)]);
    flash("Blocked");
  };

  // Reuses the existing feedback inbox (private, goes straight to the
  // owner) rather than a separate reports table and admin view - a
  // report is exactly the same shape of thing a bug report is: someone
  // telling the owner something needs their attention.
  const handleReportFriend = async (friend, reason) => {
    await submitFeedback(user.id, `Report on @${friend.username || friend.name}: ${reason?.trim() || "(no reason given)"}`, "court");
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

  const handleDeleteAccount = async (eraseContent) => {
    await deleteAccount(eraseContent);
    // The sign-in may already be gone server-side; clearing it here is only
    // tidying up this device, so a failure doesn't matter.
    try { await signOut(); } catch {}
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

  // Removed from the list immediately, not after the write round-trips -
  // "clear instantly" means instantly, and a dismiss that fails to
  // persist is a minor annoyance (it reappears next load), not something
  // worth making someone wait on or see an error for.
  const handleDismissNotification = (key) => {
    setNotifications((list) => list.filter((n) => n.key !== key));
    dismissNotification(user.id, key).catch(() => {});
  };

  const handleClearAllNotifications = () => {
    const keys = notifications.map((n) => n.key);
    setNotifications([]);
    setHasUnseenNotifications(false);
    dismissAllNotifications(user.id, keys).catch(() => {});
  };

  // Worded as where the idea came from, not an ongoing claim about their
  // opinion - this note has no live link back to the friend's throne, so
  // "swears by this one" would age into a false statement the moment they
  // change their mind.
  const addFriendPickToPretenders = async (friendName, pick) => {
    try {
      await addToPretenders(pick.cuisineId, {
        name: pick.name,
        area: pick.area,
        address: pick.address,
        city: pick.city,
        googlePlaceId: pick.googlePlaceId,
        lat: pick.lat,
        lng: pick.lng,
        note: `Added from ${friendName}'s picks.`,
      });
    } catch (e) {
      // This button has no error UI of its own (unlike the Add a place
      // modal, which shows failures inline) - the toast is the only
      // feedback here, and it now renders above any open modal.
      flash(e.message || "Couldn't add that.");
    }
  };

  const thrones = standing?.thrones ?? 0;
  const coups = standing?.coups ?? 0;
  const endorseCount = court.reduce((n, f) => n + f.picks.filter((p) => p.endorsedByMe).length, 0);
  const visitedCount = pretenders.filter((p) => p.visitedAt).length;
  const reviewCount = pretenders.filter((p) => p.visitedAt && p.note).length;
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

  // "Ask the Privy Council" - a recommendation, not a search: pulled from
  // your Court's crowns/tried picks AND your own still-to-try Next in
  // Line (a "been to" entry of your own is excluded - you've already
  // been, that's not a suggestion), never the whole city, so it always
  // reads as "something real, not a generic search result." Excludes
  // anything you've already crowned, so it never suggests something
  // you'd just have to dismiss as "already got that."
  //
  // Also excludes a pick in a different city than yours - a friend in
  // another city is still worth following for their taste, but "what
  // should I eat tonight" means tonight, where you actually are, not a
  // suggestion two provinces away. A pick with no city on file (older
  // data, from before city was captured) is kept rather than dropped,
  // since we can't actually tell it's wrong.
  // A place the owner has confirmed permanently closed: greyed out, no pin,
  // never recommended, and out of Best in the Land.
  const isClosed = (googlePlaceId) => !!googlePlaceId && closedIds.has(googlePlaceId);

  const councilLocalPool = [
    ...court.flatMap((f) => [
      ...f.picks.map((p) => ({ name: p.name, area: p.area, address: p.address, city: p.city, googlePlaceId: p.googlePlaceId, lat: p.lat, lng: p.lng, cuisine: p.cuisine, cuisineId: p.cuisineId, quote: p.decree, from: f.name, mine: false })),
      ...f.reviews.map((r) => ({ name: r.name, area: r.area, address: r.address, city: r.city, googlePlaceId: r.googlePlaceId, cuisine: r.cuisine, cuisineId: null, quote: r.note, from: f.name, mine: false })),
    ]),
    ...pretenders
      .filter((p) => !p.visitedAt)
      .map((p) => ({ name: p.name, area: p.area, address: p.address, city: p.city, googlePlaceId: p.googlePlaceId, cuisine: p.cuisine, cuisineId: p.cuisineId, quote: p.note, from: null, mine: true })),
  ].filter((c) => !c.city || !profile?.city || c.city === profile.city)
    .filter((c) => !isClosed(c.googlePlaceId));
  // Cuisine options are only what's actually local, same reasoning as
  // nilCuisineOptions above - no point offering a cuisine nobody in your
  // own city has tried.
  const councilCuisineOptions = Array.from(new Set(councilLocalPool.map((c) => c.cuisine).filter(Boolean))).sort();
  const councilPool = councilLocalPool
    .filter((c) => !pcCuisine || c.cuisine === pcCuisine)
    .filter((c) => !Object.values(slots).some((s) => s.current && sameRestaurant(s.current.name, c.name)));
  const councilPick = councilPool.length ? councilPool[pcIndex % councilPool.length] : null;

  const matchesNilCuisine = (cuisineName) =>
    !nilCuisineFilter || (nilCuisineFilter === "__uncategorized__" ? !cuisineName : cuisineName === nilCuisineFilter);

  const kingdomPins = Object.entries(slots)
    .filter(([cuisineName, slot]) => slot.current?.lat && slot.current?.lng && !isClosed(slot.current.googlePlaceId) && matchesNilCuisine(cuisineName))
    .map(([cuisineName, slot]) => ({ lat: slot.current.lat, lng: slot.current.lng, name: slot.current.name, cuisine: cuisineName }));
  // Two buckets for the Next in Line map, matching "where I've been" vs
  // "where I still want to go" - a crowned favourite counts as "been"
  // alongside any next_in_line pick already marked visited, whether or
  // not it ever became a throne.
  const beenPins = [
    ...kingdomPins,
    ...pretenders.filter((p) => p.lat && p.lng && !isClosed(p.googlePlaceId) && p.visitedAt && matchesNilCuisine(p.cuisine)).map((p) => ({ lat: p.lat, lng: p.lng, name: p.name, cuisine: p.cuisine || "Uncategorized" })),
  ];
  const wantPins = pretenders
    .filter((p) => p.lat && p.lng && !isClosed(p.googlePlaceId) && !p.visitedAt && matchesNilCuisine(p.cuisine))
    .map((p) => ({ lat: p.lat, lng: p.lng, name: p.name, cuisine: p.cuisine || "Uncategorized" }));
  // Crowned picks only, not visited-but-not-crowned reviews - this is
  // "where my friends' favourites are," same scope as Kingdom's own map.
  const courtPins = court.flatMap((f) =>
    f.picks.filter((p) => p.lat && p.lng && !isClosed(p.googlePlaceId)).map((p) => ({ lat: p.lat, lng: p.lng, name: p.name, cuisine: p.cuisine, friend: f.name }))
  );

  const pretenderQuery = pretenderSearch.trim().toLowerCase();
  const filteredPretenders = pretenders.filter((p) => {
    const matchesQuery = !pretenderQuery || [p.name, p.cuisine, p.area, p.note].some((f) => f && f.toLowerCase().includes(pretenderQuery));
    return matchesQuery && matchesNilCuisine(p.cuisine);
  });
  // Closed places sink to the bottom of their list.
  const sortByName = (a, b) => (isClosed(a.googlePlaceId) - isClosed(b.googlePlaceId)) || a.name.localeCompare(b.name);
  const stillToTry = filteredPretenders.filter((p) => !p.visitedAt).sort(sortByName);
  const beenTo = filteredPretenders.filter((p) => p.visitedAt).sort(sortByName);

  // "A friend's already been here" - built from data already loaded for
  // Court (picks + reviews per friend), matched by the same
  // name+address/area key Trending uses, so a place in your own Next in
  // Line can point back to a friend's crowned pick or visited review of
  // that exact same restaurant without a separate query.
  // Each entry is filed under its Google ID (exact) and under its
  // name+address key (for places saved without an ID); friendMatchesFor
  // looks up by ID first, then by name+address, never matching two places
  // that have different Google IDs.
  const friendActivityByGid = new Map();
  const friendActivityByText = new Map();
  const fileActivity = (place, entry) => {
    const e = { ...entry, gid: place.googlePlaceId || null };
    const textKey = placeKey(place.name, place.address, place.area);
    if (!friendActivityByText.has(textKey)) friendActivityByText.set(textKey, []);
    friendActivityByText.get(textKey).push(e);
    if (e.gid) {
      if (!friendActivityByGid.has(e.gid)) friendActivityByGid.set(e.gid, []);
      friendActivityByGid.get(e.gid).push(e);
    }
  };
  for (const f of court) {
    for (const p of f.picks) {
      fileActivity(p, { friend: f.name, crowned: true, cuisine: p.cuisine, text: p.decree });
    }
    for (const r of f.reviews) {
      if (!r.note && !r.verdict) continue;
      fileActivity(r, { friend: f.name, crowned: false, cuisine: r.cuisine, text: r.note, verdict: r.verdict });
    }
  }
  const friendMatchesFor = (p) => {
    const mine = p.googlePlaceId || null;
    const found = new Set([
      ...(mine ? friendActivityByGid.get(mine) || [] : []),
      ...(friendActivityByText.get(placeKey(p.name, p.address, p.area)) || []).filter((e) => !e.gid || !mine || e.gid === mine),
    ]);
    return found.size ? [...found] : undefined;
  };

  // Joint places, not a hard cap of three people: the three highest
  // distinct scores in your Court each earn the crown, so two friends tied
  // on 77 are both joint first and the next score down is second. Zero is
  // excluded - a score nobody's earned anything towards isn't a podium.
  const courtTopScores = [...new Set(court.map((f) => f.score))].filter((s) => s > 0).sort((a, b) => b - a).slice(0, 3);
  // Gold, silver, bronze by place. Silver and bronze are fixed mid-tones
  // that stay readable on both the light and dark card backgrounds.
  const podiumColor = (score) => {
    const place = courtTopScores.indexOf(score);
    return place === -1 ? null : [C.gold, "#9AA5B1", "#B7762E"][place];
  };
  const trendingList = bestList;
  // Search ignores the range/rank window entirely - "find any restaurant
  // anyone's crowned" shouldn't be limited to the top 25 most-crowned or
  // to whatever time range happens to be selected.
  const restaurantSearchQuery = restaurantSearch.trim().toLowerCase();
  const restaurantSearchResults = restaurantSearchQuery ? bestSearchList : null;
  // A restaurant already showing up above (someone's crowned it) shouldn't
  // also show up down here as "not yet crowned".
  const crownedKeys = new Set((restaurantSearchResults || []).map((p) => placeKey(p.name, p.address, p.area)));
  const uncrownedResults = restaurantSearchQuery
    ? uncrownedMatches.filter((r) => !crownedKeys.has(placeKey(r.name, r.address, r.area)))
    : [];

  return (
    <FontShell>
      <header className="px-5 pt-7 pb-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <LogoMark size={38} />
          <h1 className="text-4xl tracking-[0.12em]" style={{ ...display, fontWeight: 900 }}>NOMARCHY</h1>
        </div>
        <p className="mt-1 text-sm italic" style={{ ...display, color: C.muted }}>Long live your favourites.</p>
        <div className="mt-2 flex items-center justify-center">
          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
            style={{ background: C.card, color: C.muted, border: `1px solid ${C.cardEdge}` }}
          >
            <button onClick={() => setEditingProfile(true)} className="flex items-center gap-1.5">
              <Avatar url={profile?.avatar_url} size={26} />
              @{profile?.username} · {title} <RankBadge score={score} size={14} /> {profile?.is_owner && <OwnerBadge size={14} />} <Pencil size={11} />
            </button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
          <span className="relative">
            <button
              onClick={handleOpenNotifications}
              data-tour="bell"
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
              <div data-modal-backdrop className="fixed inset-0 z-[1100] flex items-start justify-center p-5 pt-24" style={{ background: "rgba(10,5,16,0.78)" }} onClick={() => setShowNotifications(false)}>
                <div role="dialog" aria-modal="true" tabIndex={-1}
                  className="w-full max-w-sm overflow-y-auto rounded-xl p-3 text-left"
                  onClick={(e) => e.stopPropagation()}
                  style={{ background: C.card, border: `1px solid ${C.cardEdge}`, boxShadow: "0 8px 24px rgba(0,0,0,0.4)", maxHeight: "70vh" }}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Notifications</div>
                    <div className="flex items-center gap-3">
                      {notifications.length > 0 && (
                        <button onClick={handleClearAllNotifications} className="text-[11px] font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.06em" }}>Clear all</button>
                      )}
                      <button onClick={() => setShowNotifications(false)} aria-label="Close" style={{ color: C.muted }}><X size={16} /></button>
                    </div>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-xs" style={{ color: C.muted }}>Nothing in the last 30 days.</p>
                  ) : notifications.map((n, i) => (
                    <div key={n.key} className="flex items-start gap-2 py-2 text-xs" style={{ borderTop: i > 0 ? `1px solid ${C.cardEdge}` : "none", color: C.cream }}>
                      {n.isNew && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.gold }} />}
                      <div className={n.isNew ? "min-w-0 flex-1" : "min-w-0 flex-1 pl-3.5"}>
                        <div>
                          {n.type === "follow" && <><span style={{ fontWeight: 700 }}>{n.name}</span> started following you</>}
                          {n.type === "crown" && <><span style={{ fontWeight: 700 }}>{n.name}</span> crowned <span style={{ color: C.goldText }}>{n.place}</span> for {n.cuisine}</>}
                          {n.type === "review" && <><span style={{ fontWeight: 700 }}>{n.name}</span> tried <span style={{ color: C.goldText }}>{n.place}</span>{n.cuisine ? ` for ${n.cuisine}` : ""}</>}
                          {n.type === "endorse" && <><span style={{ fontWeight: 700 }}>{n.name}</span> endorsed your <span style={{ color: C.goldText }}>{n.place}</span> pick</>}
                          {n.type === "promotion" && <><span style={{ fontWeight: 700 }}>{n.name}</span> was promoted to <span style={{ color: C.goldText, fontWeight: 700 }}>{n.rank}</span></>}
                          {n.type === "closed" && n.kind === "crown" && <><span style={{ color: C.goldText }}>{n.place}</span> has permanently closed. Time to pick a new favourite?</>}
                          {n.type === "closed" && n.kind === "list" && (<>
                            <span style={{ color: C.goldText }}>{n.place}</span> on your Next in Line has been marked as permanently closed. If this is an error,{" "}
                            <button
                              className="font-bold underline"
                              style={{ color: C.goldText }}
                              onClick={() => {
                                setShowNotifications(false);
                                setFeedbackPrefill(`${n.place} was marked as permanently closed, but I think that's a mistake: `);
                                setShowFeedback(true);
                              }}
                            >report it here</button>.
                          </>)}
                          {n.type === "announcement" && <><span style={{ fontWeight: 700, color: C.goldText }}>What's new:</span> {n.text}</>}
                        </div>
                        <div className="mt-0.5 text-[10px]" style={{ color: C.muted }}>{timeAgo(n.at)}</div>
                      </div>
                      <button onClick={() => handleDismissNotification(n.key)} aria-label="Dismiss" className="shrink-0 p-0.5" style={{ color: C.muted }}><X size={13} /></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}
          >
            {theme === "light" ? <Moon size={13} /> : <Sun size={13} />}
          </button>
          {profile?.is_owner && (
            <button
              onClick={() => setTab("admin")}
              aria-label="Admin"
              className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
              style={tab === "admin" ? { background: C.gold, color: C.onGold } : { color: C.muted, border: `1px solid ${C.cardEdge}` }}
            >
              <ShieldCheck size={12} /> Admin
            </button>
          )}
          <button onClick={signOut} aria-label="Sign out" className="flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}>
            <LogOut size={12} /> Sign out
          </button>
        </div>
      </header>

      {loadError && (
        <div className="mx-auto mb-4 max-w-2xl rounded-lg px-4 py-2 text-center text-sm" style={{ background: C.coup + "18", color: C.coup }}>
          {loadError}
        </div>
      )}

      {/* A tidy 2x2 grid on phones - four pills in a wrapping row left
          "Best in the Land" stranded alone on a second line. One row again
          from sm up, where they fit. */}
      <nav className="mx-auto grid max-w-sm grid-cols-2 gap-2 px-5 pb-5 sm:flex sm:max-w-none sm:flex-wrap sm:justify-center sm:px-4">
        {[
          { id: "kingdom", label: "Kingdom", icon: Crown },
          { id: "pretenders", label: "Next in Line", icon: Bookmark },
          { id: "court", label: "Court", icon: Users },
          { id: "top25", label: "Best in the Land", icon: TrendingUp },
        ].map(({ id, label, icon: Icon }) => (
          <button key={id} data-tour={`tab-${id}`} onClick={() => setTab(id)} className="flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold sm:px-4"
            style={tab === id ? { background: C.gold, color: C.onGold, border: `1px solid ${C.gold}` } : { background: C.card, color: C.muted, border: `1px solid ${C.cardEdge}` }}>
            <Icon size={15} strokeWidth={2.2} />{label}
          </button>
        ))}
      </nav>

      <main className="mx-auto max-w-2xl px-5 pb-28">
        {!loaded ? (
          <div>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="mb-3 rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
                <Skeleton className="h-2.5 w-24" />
                <Skeleton className="mt-3 h-4 w-3/5" />
                <Skeleton className="mt-2 h-2.5 w-2/5" />
                <Skeleton className="mt-4 h-8 w-28 rounded-lg" />
              </div>
            ))}
          </div>
        ) : (<>
        {/* KINGDOM */}
        {tab === "kingdom" && (<div>
          {/* Caption comes first, same as every other tab's opening line
              (Next in Line, Court, Best in the Land) - it used to sit
              below the Overall Favourite card instead, so Kingdom was the
              one tab that opened straight into a card with no lead-in,
              making the top of the page feel like it jumped around
              between tabs rather than starting the same way each time. */}
          <p className="mb-3 text-sm" style={{ color: C.muted }}>One throne per cuisine. Choose like it matters.</p>

          {overallCuisine && (
            <div className="mb-4">
              <ThroneCard
                featured
                cuisineName={OVERALL_FAVOURITE_NAME}
                cuisineId={overallCuisine.id}
                slot={slots[OVERALL_FAVOURITE_NAME]}
                closed={isClosed(slots[OVERALL_FAVOURITE_NAME]?.current?.googlePlaceId)}
                historyOpen={historyOpen}
                setHistoryOpen={setHistoryOpen}
                setModal={setModal}
                sharePick={sharePick}
                fmt={fmt}
                onUnCrown={() => handleUnCrown(overallCuisine.id, slots[OVERALL_FAVOURITE_NAME]?.current)}
                onEditDecree={(decree) => handleEditDecree(slots[OVERALL_FAVOURITE_NAME]?.current?.id, decree)}
                onEditLocation={(location) => handleEditThroneLocation(slots[OVERALL_FAVOURITE_NAME]?.current?.id, location)}
                onEditPhotos={(photos) => handleEditThronePhotos(slots[OVERALL_FAVOURITE_NAME]?.current?.id, photos)}
                userId={user.id}
              />
            </div>
          )}

          <div className="mb-3 flex items-center justify-end gap-2">
            {kingdomView === "grid" && (
              <button onClick={() => setOnlyCrowned(!onlyCrowned)} className="min-w-[124px] rounded-full px-3 py-1 text-center text-xs font-semibold" style={{ background: onlyCrowned ? C.gold : C.card, color: onlyCrowned ? C.onGold : C.muted, border: `1px solid ${C.cardEdge}` }}>
                {onlyCrowned ? "Showing crowned" : "Show all"}
              </button>
            )}
            <div className="flex overflow-hidden rounded-full" style={{ border: `1px solid ${C.cardEdge}` }}>
              <button onClick={() => setKingdomView("grid")} className="px-3 py-1 text-xs font-semibold" style={{ background: kingdomView === "grid" ? C.gold : C.card, color: kingdomView === "grid" ? C.onGold : C.muted }}>
                Grid
              </button>
              <button onClick={() => setKingdomView("map")} className="px-3 py-1 text-xs font-semibold" style={{ background: kingdomView === "map" ? C.gold : C.card, color: kingdomView === "map" ? C.onGold : C.muted, borderLeft: `1px solid ${C.cardEdge}` }}>
                Map
              </button>
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
                  closed={isClosed(slots[cuisineName]?.current?.googlePlaceId)}
                  cuisineEmoji={getCuisineEmoji(cuisineName)}
                  onChangeEmoji={(() => { const c = selectableCuisines.find((x) => x.name === cuisineName); return c && !c.is_default ? (emoji) => handleChangeCuisineEmoji(c.id, emoji) : undefined; })()}
                  historyOpen={historyOpen}
                  setHistoryOpen={setHistoryOpen}
                  setModal={setModal}
                  sharePick={sharePick}
                  fmt={fmt}
                  emptyCuisines={selectableCuisines.filter((c) => c.id !== thisId && !slots[c.name]?.current)}
                  onMoveCuisine={(newCuisineId) => handleMoveCuisine(slots[cuisineName]?.current?.id, newCuisineId)}
                  onUnCrown={() => handleUnCrown(thisId, slots[cuisineName]?.current)}
                  onEditDecree={(decree) => handleEditDecree(slots[cuisineName]?.current?.id, decree)}
                  onEditLocation={(location) => handleEditThroneLocation(slots[cuisineName]?.current?.id, location)}
                  onEditPhotos={(photos) => handleEditThronePhotos(slots[cuisineName]?.current?.id, photos)}
                  onHide={() => handleHideCuisine(thisId)}
                  userId={user.id}
                />
              );
            })}

            {!onlyCrowned && (<div className="flex min-h-28 flex-col items-center justify-center rounded-xl p-4" style={{ border: `1px dashed ${C.cardEdge}` }}>
              {addingCuisine ? (<div className="w-full"><div className="flex w-full gap-2">
                <button type="button" onClick={() => setPickingNewEmoji((v) => !v)} aria-label="Pick an icon" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg" style={{ background: C.bg, border: `1px solid ${pickingNewEmoji ? C.gold : C.cardEdge}` }}>
                  {newCuisineEmoji || "🍽️"}
                </button>
                <input aria-label="New cuisine name" autoFocus value={newCuisine} onChange={(e) => setNewCuisine(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddCuisine()} placeholder="e.g. Pho, Wings" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
                <button onClick={handleAddCuisine} className="rounded-lg px-3 text-sm font-bold" style={{ background: C.gold, color: C.onGold }}>Add</button>
              </div>
              {pickingNewEmoji && <CuisineEmojiGrid onPick={(e) => { setNewCuisineEmoji(e); setPickingNewEmoji(false); }} />}
              {!pickingNewEmoji && !newCuisineEmoji && <p className="mt-1.5 text-xs" style={{ color: C.muted }}>Tap the plate to pick an icon for its map pins.</p>}
              </div>) : (<button onClick={() => setAddingCuisine(true)} className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: C.muted }}><Plus size={15} /> Add a cuisine</button>)}
            </div>)}
          </div>
          )}
        </div>)}

        {/* PRETENDERS */}
        {tab === "pretenders" && (<div>
          <p className="mb-3 text-sm" style={{ color: C.muted }}>The places waiting for their shot at a throne. Go, eat, then decide.</p>

          <div className="mb-4 rounded-xl" style={{ background: C.card, border: `1px solid ${C.gold}66` }}>
            <button onClick={() => setCouncilOpen((v) => !v)} aria-expanded={councilOpen} className="flex w-full items-center justify-between gap-3 p-4 text-left">
              <span>
                <span className="flex items-center gap-1.5 text-xs font-bold uppercase" style={{ color: C.goldText, letterSpacing: "0.1em" }}>
                  <Crown size={12} /> The Privy Council
                </span>
                <span className="mt-1 block text-sm" style={{ color: C.cream }}>Can&apos;t decide what to eat this evening?</span>
              </span>
              <ChevronDown size={16} className="shrink-0 transition-transform" style={{ color: C.muted, transform: councilOpen ? "rotate(180deg)" : "none" }} />
            </button>
            {councilOpen && (<div className="px-4 pb-4">
            {councilLocalPool.length === 0 ? (
              <p className="mt-2 text-sm" style={{ color: C.muted }}>Follow a few friends in Court, or add something to Next in Line, and the Council will have something to work with.</p>
            ) : (<>
              <select aria-label="Privy Council cuisine"
                value={pcCuisine}
                onChange={(e) => { setPcCuisine(e.target.value); setPcIndex(0); }}
                className="mt-2 w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: pcCuisine ? C.goldText : C.cream }}
              >
                <option value="">Any cuisine</option>
                {councilCuisineOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              {councilPick ? (
                <div className="mt-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
                  <div className="text-sm font-bold">{councilPick.name}</div>
                  <div className="text-xs" style={{ color: C.muted }}>{[councilPick.cuisine, councilPick.area].filter(Boolean).join(" · ")} - {councilPick.mine ? "on your list" : `via ${councilPick.from}`}</div>
                  {/* Buttons sit right after the name, above the quote -
                      the quote's length varies a lot (or is sometimes
                      missing entirely), and having it above the buttons
                      meant "Show me another" landed in a different spot
                      on screen every time you tapped it. */}
                  <div className="mt-2 flex gap-2">
                    {!councilPick.mine && (
                      <button onClick={() => handleAddCouncilPick(councilPick)} className="flex-1 rounded-lg py-2 text-xs font-bold" style={{ background: C.gold, color: C.onGold }}>Add to my list</button>
                    )}
                    <button onClick={handleAskCouncil} disabled={councilPool.length <= 1} className={councilPick.mine ? "flex-1 rounded-lg py-2 text-xs font-bold" : "rounded-lg px-3 py-2 text-xs font-bold"} style={councilPool.length <= 1 ? { border: `1px solid ${C.cardEdge}`, color: C.cardEdge } : { border: `1px solid ${C.cardEdge}`, color: C.muted }}>Show me another</button>
                  </div>
                  {councilPick.quote && <p className="mt-2 text-xs italic" style={{ color: C.cream }}>&ldquo;{councilPick.quote}&rdquo;</p>}
                </div>
              ) : (
                <p className="mt-2 text-sm" style={{ color: C.muted }}>Nobody in your Court has crowned or tried {pcCuisine || "anything"} yet, and nothing&apos;s on your own list either{pcCuisine ? " - try Any cuisine" : ""}.</p>
              )}
            </>)}
            </div>)}
          </div>

          <div className="mb-3 flex gap-2">
            <button onClick={() => { setAddPretenderPrefillName(""); setAddPretender(true); }} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold" style={{ background: C.gold, color: C.onGold }}><Plus size={16} /> Add a place</button>
            <button onClick={() => setImporting(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold" style={{ border: `1px solid ${C.gold}66`, color: C.goldText }}><ClipboardPaste size={16} /> Import a list</button>
          </div>

          {pretenders.length > 0 && (
            <div className="mb-3 flex items-center justify-between gap-2">
              <select aria-label="Filter Next in Line by cuisine"
                value={nilCuisineFilter}
                onChange={(e) => setNilCuisineFilter(e.target.value)}
                className="rounded-lg px-3 py-1.5 text-xs outline-none"
                style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: nilCuisineFilter ? C.goldText : C.cream }}
              >
                <option value="">All cuisines</option>
                {nilCuisineOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                {nilHasUncategorized && <option value="__uncategorized__">Uncategorized</option>}
              </select>
              <div className="flex shrink-0 overflow-hidden rounded-full" style={{ border: `1px solid ${C.cardEdge}` }}>
                <button onClick={() => setNilView("grid")} className="px-3 py-1 text-xs font-semibold" style={{ background: nilView === "grid" ? C.gold : C.card, color: nilView === "grid" ? C.onGold : C.muted }}>
                  Grid
                </button>
                <button onClick={() => setNilView("map")} className="px-3 py-1 text-xs font-semibold" style={{ background: nilView === "map" ? C.gold : C.card, color: nilView === "map" ? C.onGold : C.muted, borderLeft: `1px solid ${C.cardEdge}` }}>
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
              <input aria-label="Search your list"
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
                  style={{ color: C.goldText }}
                >
                  <Plus size={14} /> Add &ldquo;{pretenderSearch}&rdquo; to your list
                </button>
              )}
            </div>
          ) : (<>
            <div className="mb-3 flex overflow-hidden rounded-xl" style={{ border: `1px solid ${C.cardEdge}` }} role="tablist">
              {[["want", "Still to try", stillToTry.length], ["been", "Been to", beenTo.length]].map(([id, label, n], i) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={nilList === id}
                  onClick={() => setNilList(id)}
                  className="flex-1 py-2 text-sm font-semibold"
                  style={{ background: nilList === id ? C.gold : C.card, color: nilList === id ? C.onGold : C.muted, borderLeft: i > 0 ? `1px solid ${C.cardEdge}` : "none" }}
                >
                  {label} ({n})
                </button>
              ))}
            </div>
            {(nilList === "want" ? stillToTry : beenTo).length === 0 && (
              <p className="rounded-xl p-5 text-center text-sm" style={{ background: C.card, border: `1px dashed ${C.cardEdge}`, color: C.muted }}>
                {nilList === "want" ? "Nothing still to try here - add a place above." : "Nothing marked as been yet - mark a place as been once you've eaten there."}
              </p>
            )}
            {(nilList === "want" ? stillToTry : beenTo).map((p) => (
              <PretenderCard key={p.id} p={p} selectableCuisines={selectableCuisines} userId={user.id}
                friendMatches={friendMatchesFor(p)} closed={isClosed(p.googlePlaceId)}
                onShare={sharePretender}
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
        </div>)}

        {/* COURT */}
        {tab === "court" && (<div>
          <p className="mb-3 text-sm" style={{ color: C.muted }}>Your friends&apos; reigning picks. Endorse the good ones, or add them to your own shortlist.</p>

          <button onClick={handleInviteFriend} className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold" style={{ background: C.gold, color: C.onGold }}>
            <Share2 size={14} /> Invite a friend
          </button>

          <button onClick={() => setShowMembers(true)} className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-bold" style={{ background: C.card, color: C.cream, border: `1px solid ${C.cardEdge}` }}>
            <Users size={14} /> Find people
          </button>

          <form onSubmit={handleAddFollow} className="mb-4 flex gap-2">
            <input aria-label="Follow by username" value={followInput} onChange={(e) => setFollowInput(e.target.value)} placeholder="Follow by username" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
            <button type="submit" disabled={followBusy || !followInput.trim()} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-bold" style={{ background: C.gold, color: C.onGold }}>
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
                    style={{ background: C.gold, color: C.onGold }}
                  >
                    {followBackBusy === f.id ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />}
                    Follow back
                  </button>
                </div>
              ))}
            </div>
          )}

          {(court.length > 0 || followers.length > 0) && (
            <p className="mb-2 text-xs font-semibold" style={{ color: C.muted }}>
              {court.length} in your Court · {followers.length} follower{followers.length === 1 ? "" : "s"}
            </p>
          )}

          {court.length > 0 && (
            <div className="mb-3 flex items-center justify-between gap-2">
              {courtView === "grid" ? (
                <div className="flex overflow-hidden rounded-full" style={{ border: `1px solid ${C.cardEdge}` }}>
                  <button onClick={() => changeCourtDensity("expanded")} className="px-3 py-1 text-xs font-semibold" style={{ background: courtDensity === "expanded" ? C.gold : C.card, color: courtDensity === "expanded" ? C.onGold : C.muted }}>
                    Expanded
                  </button>
                  <button onClick={() => changeCourtDensity("compact")} className="px-3 py-1 text-xs font-semibold" style={{ background: courtDensity === "compact" ? C.gold : C.card, color: courtDensity === "compact" ? C.onGold : C.muted, borderLeft: `1px solid ${C.cardEdge}` }}>
                    Compact
                  </button>
                </div>
              ) : <span />}
              <div className="flex overflow-hidden rounded-full" style={{ border: `1px solid ${C.cardEdge}` }}>
                <button onClick={() => setCourtView("grid")} className="px-3 py-1 text-xs font-semibold" style={{ background: courtView === "grid" ? C.gold : C.card, color: courtView === "grid" ? C.onGold : C.muted }}>
                  Grid
                </button>
                <button onClick={() => setCourtView("map")} className="px-3 py-1 text-xs font-semibold" style={{ background: courtView === "map" ? C.gold : C.card, color: courtView === "map" ? C.onGold : C.muted, borderLeft: `1px solid ${C.cardEdge}` }}>
                  Map
                </button>
              </div>
            </div>
          )}

          {court.length === 0 ? (
            <div className="rounded-xl p-6 text-center" style={{ background: C.card, border: `1px dashed ${C.cardEdge}` }}>
              <Users size={26} className="mx-auto" style={{ color: C.muted }} />
              <p className="mt-2 text-sm" style={{ color: C.muted }}>Nobody in your court yet. Follow a friend by username above, and share yours (@{profile?.username}) so they can follow you back.</p>
            </div>
          ) : courtView === "map" ? (
            <KingdomMap pins={courtPins} emptyMessage="None of your friends' crowned spots have a location yet." />
          ) : courtDensity === "compact" ? court.map((f) => (
            <button
              key={f.id}
              onClick={() => setCourtModalFriendId(f.id)}
              className="mb-2 flex w-full items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-left"
              style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}
            >
              <div className="flex items-center gap-2.5">
                <Avatar url={f.avatarUrl} size={28} />
                <h3 className="flex items-center gap-1.5 text-base" style={{ ...display, fontWeight: 700 }}>
                  {f.name} {podiumColor(f.score) && <Crown size={14} style={{ color: podiumColor(f.score) }} fill={podiumColor(f.score)} strokeWidth={0} />} {f.isOwner && <OwnerBadge />}
                </h3>
              </div>
              <ChevronDown size={16} className="shrink-0" style={{ color: C.muted, transform: "rotate(-90deg)" }} />
            </button>
          )) : court.map((f) => (
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
                    {f.name} {podiumColor(f.score) && <Crown size={16} style={{ color: podiumColor(f.score) }} fill={podiumColor(f.score)} strokeWidth={0} />} {f.isOwner && <OwnerBadge />}
                  </h3>
                  {podiumColor(f.score) && (
                    <span
                      className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                      style={{ background: C.bg, color: podiumColor(f.score), letterSpacing: "0.06em" }}
                    >
                      {getTitle(f.isOwner, f.score)}
                    </span>
                  )}
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
                {podiumColor(f.score) && <span className="text-xs font-semibold" style={{ color: podiumColor(f.score) }}>{f.score}</span>}
                <ChevronDown size={16} style={{ color: C.muted, transform: "rotate(-90deg)" }} />
              </div>
            </button>
          ))}
        </div>)}

        {/* BEST IN THE LAND (restaurants: the trending leaderboard, plus search across every crown app-wide) */}
        {tab === "top25" && (<div>
          <p className="mb-3 text-sm" style={{ color: C.muted }}>
            {top25Scope === "friends" ? "The most-crowned restaurants in your Court" : "The most-crowned restaurants across everyone's public kingdoms"} - or search for any of them.
          </p>
          <div className="mb-3 flex overflow-hidden rounded-full" style={{ border: `1px solid ${C.cardEdge}`, width: "fit-content" }}>
            <button onClick={() => setTop25Scope("everyone")} className="px-4 py-1.5 text-xs font-semibold" style={{ background: top25Scope === "everyone" ? C.gold : C.card, color: top25Scope === "everyone" ? C.onGold : C.muted }}>
              Everyone
            </button>
            <button onClick={() => setTop25Scope("friends")} className="px-4 py-1.5 text-xs font-semibold" style={{ background: top25Scope === "friends" ? C.gold : C.card, color: top25Scope === "friends" ? C.onGold : C.muted, borderLeft: `1px solid ${C.cardEdge}` }}>
              My Court
            </button>
          </div>
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.muted }} />
            <input aria-label="Search every crowned restaurant"
              value={restaurantSearch}
              onChange={(e) => setRestaurantSearch(e.target.value)}
              placeholder="Search every crowned restaurant"
              className="w-full rounded-lg py-2.5 pl-9 pr-3 text-sm outline-none"
              style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }}
            />
          </div>
          {!restaurantSearchResults && (<div className="mb-2 flex gap-2">
            <select aria-label="Time range"
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
            <input aria-label="Filter by city or neighbourhood" value={top25City} onChange={(e) => setTop25City(e.target.value)} placeholder="Filter by city or neighbourhood" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
            <button onClick={handleNearMe} disabled={top25Locating} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-bold" style={{ background: C.card, color: C.muted, border: `1px solid ${C.cardEdge}` }}>
              {top25Locating ? <Loader2 size={13} className="animate-spin" /> : <Navigation size={13} />} Near me
            </button>
          </div>)}
          {!restaurantSearchResults && top25City && <button onClick={() => setTop25City("")} className="mb-3 text-xs font-semibold" style={{ color: C.muted }}>Clear filter</button>}
          {top25Error && <p className="mb-3 text-xs" style={{ color: C.coup }}>{top25Error}</p>}
          {!bestList && !top25Error && <RowSkeleton count={5} />}
          {restaurantSearchResults ? (
            restaurantSearchResults.length === 0 && uncrownedResults.length === 0
              ? <p className="text-sm" style={{ color: C.muted }}>No restaurant matches that yet.</p>
              : restaurantSearchResults.map((p, i) => <RestaurantRow key={i} p={p} onOpen={() => setOpenRestaurant(p)} />)
          ) : trendingList && (() => {
            const q = top25City.trim().toLowerCase();
            const filtered = q
              ? trendingList.filter((p) => [p.area, p.address].filter(Boolean).some((f) => f.toLowerCase().includes(q)))
              : trendingList;
            const shownPlaces = filtered.slice(0, 25);
            if (shownPlaces.length === 0) return <p className="text-sm" style={{ color: C.muted }}>{top25Scope === "friends" ? "Nobody in your Court has crowned anything in that window yet." : "Nothing crowned in that window yet."}</p>;
            return shownPlaces.map((p, i) => <RestaurantRow key={i} p={p} rank={i} onOpen={() => setOpenRestaurant(p)} />);
          })()}
          {uncrownedResults.length > 0 && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Not yet crowned - be the first</h4>
              {uncrownedResults.map((r, i) => (
                <div
                  key={i}
                  onClick={() => { setAddPretenderPrefillName(r.name); setAddPretender(true); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setAddPretenderPrefillName(r.name); setAddPretender(true); } }}
                  className="mb-2 flex cursor-pointer items-center gap-3 rounded-xl p-3"
                  style={{ background: C.card, border: `1px dashed ${C.cardEdge}` }}
                >
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-sm font-semibold">{r.name}</span>
                    <div className="truncate text-xs" style={{ color: C.muted }}>{[r.area, r.address].filter(Boolean).join(" · ")}</div>
                  </div>
                  <span className="flex shrink-0 items-center gap-0.5 text-xs font-bold" style={{ color: C.goldText }}><Plus size={12} /> Add</span>
                </div>
              ))}
            </div>
          )}
        </div>)}

        {openRestaurant && (
          <RestaurantProfileModal restaurant={openRestaurant} onClose={() => setOpenRestaurant(null)} />
        )}

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
                  <div className="text-2xl" style={{ ...display, fontWeight: 900, color: C.goldText }}>{value}</div>
                  <div className="mt-0.5 text-xs" style={{ color: C.muted }}>{label}</div>
                </div>
              ))}
            </div>

            {(() => {
              // One-line summaries shown on each collapsed section, so the
              // headline of each is visible without opening it.
              const signupsThisWeek = adminData.signupSources.rows.reduce((n, r) => n + r.week, 0) + adminData.signupSources.unknown.week;
              const googleMonth = adminData.googleUsage ? adminData.googleUsage.reduce((n, u) => n + u.thisMonth, 0) : null;
              const toReview = adminData.placeIssues?.length || 0;
              const googleSummary = [googleMonth === null ? null : `${googleMonth} calls this month`, toReview ? `${toReview} to review` : null].filter(Boolean).join(" · ");
              return (<>
            <AdminSection title={`Feedback (${adminData.feedback.length})`}>
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
            </AdminSection>

            <AdminSection
              title="Errors"
              right={adminData.errors === null ? "not set up yet" : (() => { const n = adminData.errors.filter((e) => Date.now() - e.lastSeen < 86400000).length; return n ? `${n} in the last day` : "none in the last day"; })()}
            >
              {adminData.errors === null ? (
                <p className="text-xs" style={{ color: C.muted }}>Run the latest database update (schema.sql) to start collecting error reports.</p>
              ) : adminData.errors.length === 0 ? (
                <p className="text-sm" style={{ color: C.green }}>No errors reported. Nice.</p>
              ) : (<>
                <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
                  {adminData.errors.map((e, i) => (
                    <details key={e.id} className="px-3 py-2.5" style={i > 0 ? { borderTop: `1px solid ${C.cardEdge}` } : undefined}>
                      <summary className="cursor-pointer text-sm">
                        <span className="font-semibold">{e.message}</span>
                        <span className="mt-0.5 block text-xs" style={{ color: C.muted }}>
                          {e.source === "server" ? "Server" : "App"} · {e.page || "unknown page"} · {e.occurrences}× · last {fmt(e.lastSeen)}
                        </span>
                      </summary>
                      {e.userAgent && e.userAgent !== "server" && <p className="mt-2 text-xs" style={{ color: C.muted }}>{e.userAgent}</p>}
                      {e.stack && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg p-2 text-[11px]" style={{ background: C.bg, color: C.muted }}>{e.stack}</pre>}
                    </details>
                  ))}
                </div>
                <button
                  onClick={async () => {
                    try { await clearAppErrors(); setAdminData({ ...adminData, errors: [] }); flash("Errors cleared"); } catch (err) { flash(err.message || "Couldn't clear them"); }
                  }}
                  className="mt-2 text-xs font-semibold" style={{ color: C.muted }}
                >
                  Clear all
                </button>
              </>)}
              <p className="mt-2 text-xs leading-relaxed" style={{ color: C.muted }}>
                Problems from anyone&apos;s app or the server, without who it was. A daily email flags new ones; reports older than 90 days are removed.
              </p>
            </AdminSection>

            <AdminSection title="Signups by source" right={`${signupsThisWeek} this week`}>
            <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
              <div className="grid grid-cols-[1fr_5.5rem_5rem] gap-x-4 px-3 py-2 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>
                <span>Source</span><span className="text-right">This week</span><span className="text-right">All time</span>
              </div>
              {adminData.signupSources.rows.map((r) => (
                <div key={r.source} className="grid grid-cols-[1fr_5.5rem_5rem] gap-x-4 px-3 py-2 text-sm" style={{ borderTop: `1px solid ${C.cardEdge}` }}>
                  <span className="truncate font-semibold">{r.source}</span>
                  <span className="text-right" style={{ color: C.goldText }}>{r.week}</span>
                  <span className="text-right" style={{ color: C.goldText }}>{r.allTime}</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_5.5rem_5rem] gap-x-4 px-3 py-2 text-sm" style={{ borderTop: `1px solid ${C.cardEdge}`, color: C.muted }}>
                <span>Unknown / direct</span>
                <span className="text-right">{adminData.signupSources.unknown.week}</span>
                <span className="text-right">{adminData.signupSources.unknown.allTime}</span>
              </div>
            </div>
            </AdminSection>

            <AdminSection title={`All users (${adminData.users.length})`}>
            <div className="max-h-96 overflow-y-auto rounded-xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
              {adminData.users.map((u) => (
                <div key={u.id} className="flex items-center justify-between gap-2 px-3 py-2" style={{ borderTop: `1px solid ${C.cardEdge}` }}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">@{u.username}{!u.onboarded && <span className="ml-1.5 text-xs font-normal" style={{ color: C.muted }}>(not onboarded)</span>}</div>
                    <div className="truncate text-xs" style={{ color: C.muted }}>{u.email || "no email on file"}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs" style={{ color: C.muted }}>
                    <div>Joined {fmt(u.createdAt)}{u.source && ` · via ${u.source}`}</div>
                    <div>{u.lastSignInAt ? `Last in ${fmt(u.lastSignInAt)}` : "Never signed in"}</div>
                  </div>
                </div>
              ))}
            </div>
            </AdminSection>

            <AdminSection title="Popular places and cuisines">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase" style={{ color: C.goldText, letterSpacing: "0.14em" }}>Most-crowned places</h3>
                <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
                  {adminData.topPlaces.length === 0 && <p className="p-3 text-sm" style={{ color: C.muted }}>Nothing crowned yet.</p>}
                  {adminData.topPlaces.map((p, i) => (
                    <div key={p.name} className="flex items-center justify-between px-3 py-2 text-sm" style={i > 0 ? { borderTop: `1px solid ${C.cardEdge}` } : undefined}>
                      <span className="truncate">{p.name}</span>
                      <span className="shrink-0 font-bold" style={{ color: C.goldText }}>{p.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase" style={{ color: C.goldText, letterSpacing: "0.14em" }}>Most-crowned cuisines</h3>
                <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
                  {adminData.topCuisines.length === 0 && <p className="p-3 text-sm" style={{ color: C.muted }}>Nothing crowned yet.</p>}
                  {adminData.topCuisines.map((c, i) => (
                    <div key={c.name} className="flex items-center justify-between px-3 py-2 text-sm" style={i > 0 ? { borderTop: `1px solid ${C.cardEdge}` } : undefined}>
                      <span className="truncate">{c.name}</span>
                      <span className="shrink-0 font-bold" style={{ color: C.goldText }}>{c.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            </AdminSection>

            <AdminSection title="Google" right={googleSummary}>
            <div className="rounded-xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
              {adminData.googleUsage === null ? (
                <p className="p-3 text-xs" style={{ color: C.muted }}>Counting hasn&apos;t started - run the latest database update (schema.sql) to turn it on.</p>
              ) : (<>
                <div className="grid grid-cols-[1fr_3.5rem_4.5rem_4rem] gap-x-3 px-3 py-2 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>
                  <span>Calls</span><span className="text-right">Today</span><span className="text-right">Month</span><span className="text-right">All time</span>
                </div>
                {adminData.googleUsage.length === 0 && (
                  <p className="px-3 py-2 text-sm" style={{ color: C.muted, borderTop: `1px solid ${C.cardEdge}` }}>Nothing yet - the next place search will show up here.</p>
                )}
                {adminData.googleUsage.map((u) => (
                  <div key={u.kind} className="grid grid-cols-[1fr_3.5rem_4.5rem_4rem] gap-x-3 px-3 py-2 text-sm" style={{ borderTop: `1px solid ${C.cardEdge}` }}>
                    <span className="truncate font-semibold">{GOOGLE_USAGE_LABELS[u.kind] || u.kind}</span>
                    <span className="text-right" style={{ color: C.goldText }}>{u.today}</span>
                    <span className="text-right" style={{ color: C.goldText }}>{u.thisMonth}</span>
                    <span className="text-right" style={{ color: C.goldText }}>{u.allTime}</span>
                  </div>
                ))}
                <p className="px-3 py-2 text-xs leading-relaxed" style={{ color: C.muted, borderTop: `1px solid ${C.cardEdge}` }}>
                  Our own count of calls to Google since counting began (UTC days and months). Place searches get roughly 5,000 free a month - check Google&apos;s pricing page for the exact figure. Google&apos;s billing page is what you&apos;re actually charged on.
                </p>
              </>)}
            </div>
            {adminData.placeIssues?.length > 0 && (<>
              <h4 className="mb-2 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>Places Google can&apos;t find</h4>
              <div className="mt-3 rounded-xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
                {adminData.placeIssues.map((p, i) => (
                  <div key={`${p.name}-${p.notedAt}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm" style={{ borderTop: i > 0 ? `1px solid ${C.cardEdge}` : "none" }}>
                    <span className="truncate font-semibold">{p.name}</span>
                    <span className="shrink-0 text-xs" style={{ color: C.muted }}>{new Date(p.notedAt).toLocaleDateString()}</span>
                  </div>
                ))}
                <p className="px-3 py-2 text-xs leading-relaxed" style={{ color: C.muted, borderTop: `1px solid ${C.cardEdge}` }}>
                  The daily location check couldn&apos;t find these on Google (often a closed or renamed restaurant). Nothing has been changed on anyone&apos;s kingdom - they&apos;re listed so you can decide.
                </p>
              </div>
            </>)}
            </AdminSection>

            <div className="mt-5 mb-1 text-xs font-bold uppercase" style={{ color: C.goldText, letterSpacing: "0.14em" }}>Tools</div>
            <AdminSection title="Fix a restaurant"><FixThroneTool cuisines={selectableCuisines} /></AdminSection>
            <AdminSection title="Match places to Google"><PlaceMatchTool /></AdminSection>
            <AdminSection title="Check for closures"><ClosureCheckTool /></AdminSection>
              </>);
            })()}
          </>)}
        </div>)}

        </>)}
      </main>

      {/* Always in the page, so screen readers announce each message. */}
      <div role="status" aria-live="polite" className="sr-only">{toast}</div>
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[1200] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full py-2 pl-4 pr-2 text-sm font-semibold shadow-lg" style={{ background: C.gold, color: C.onGold }}>
          <span aria-hidden="true"><Check size={14} className="mr-1 inline" />{toast}</span>
          <button onClick={() => setToast("")} aria-label="Dismiss message" className="rounded-full p-1"><X size={14} /></button>
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
          closedIds={closedIds}
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
            closedIds={closedIds}
            onClose={() => setCourtModalFriendId(null)}
            onEndorse={handleEndorse}
            onAddToList={addFriendPickToPretenders}
            onBlock={() => { handleBlockFriend(f.id); setCourtModalFriendId(null); }}
            onReport={(reason) => handleReportFriend(f, reason)}
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
          closedIds={closedIds}
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

      {profile?.onboarded && promotion && (
        <PromotionModal
          rank={promotion}
          nextRank={RANKS.find((r) => r.min > promotion.min)}
          score={score}
          thrones={thrones}
          reviewCount={reviewCount}
          profile={profile}
          onShare={() => sharePromotion(promotion)}
          onClose={() => setPromotion(null)}
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
            { n: followers.length, label: "Followers", hint: "People following you" },
            { n: court.length, label: "In your Court", hint: "People you follow" },
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
          onFeedback={() => { setEditingProfile(false); setShowFeedback(true); }}
          onTour={() => { setEditingProfile(false); setTourOpen(true); }}
          a11y={a11y}
          onChangeA11y={updateA11y}
        />
      )}

      {tourOpen && <Tour onSetTab={(t) => t && setTab(t)} onDone={endTour} />}

      {showFeedback && (
        <FeedbackModal
          initialMessage={feedbackPrefill}
          onClose={() => { setShowFeedback(false); setFeedbackPrefill(""); }}
          onSubmit={handleSubmitFeedback}
        />
      )}

      {showMembers && (
        <MembersModal userId={user.id} onFollow={handleFollowFromDirectory} onClose={() => setShowMembers(false)} />
      )}
    </FontShell>
  );
}
