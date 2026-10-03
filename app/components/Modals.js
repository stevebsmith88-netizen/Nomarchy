"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { C, OwnerBadge, RankBadge, body, display, getTitle } from "../theme";
import { Avatar, AvatarPicker, ClosedBadge, MAX_IMPORT_CHARS, MIN_DECREE_LENGTH, PersonRow, PhotoPicker, PhotoStrip, RowSkeleton, knownFor } from "./shared";
import { suggestCuisineName } from "@/lib/cuisineFromGoogle";
import { loadDirectory, loadPlaceSlug, loadRestaurantProfile, loadRestaurantVisitCount, loadRestaurantWantingCount, loadSuggestedFriends, supabase } from "@/lib/data";
import { safeMapsUrl } from "@/lib/safeUrl";
import { clearDraft, loadDraft, saveDraft } from "@/lib/decreeDrafts";
import { Bookmark, Check, Crown, ExternalLink, Loader2, MessageSquare, Search, Share2, Star, Swords, Wand2, X } from "lucide-react";

// A restaurant's own page - every public crown on it app-wide, opened by
// tapping a RestaurantRow. Same "profile pop up" shell used everywhere
// else in the app (header + scrollable body), per Steve's request that
// this feel like the existing pop-ups rather than a new pattern.
export function RestaurantProfileModal({ restaurant, onClose }) {
  const [entries, setEntries] = useState(null);
  const [err, setErr] = useState("");
  const [visitCount, setVisitCount] = useState(null);
  const [wantingCount, setWantingCount] = useState(null);
  const [slug, setSlug] = useState(null);
  const fmt = (t) => new Date(t).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

  // Its public restaurant page, if it has a Google ID (and so a page).
  useEffect(() => {
    if (!restaurant.googlePlaceId) return;
    let cancelled = false;
    loadPlaceSlug(restaurant.googlePlaceId).then((s) => { if (!cancelled) setSlug(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [restaurant.googlePlaceId]);

  useEffect(() => {
    let cancelled = false;
    loadRestaurantProfile(restaurant.name, restaurant.address, restaurant.area, restaurant.googlePlaceId)
      .then((data) => { if (!cancelled) setEntries(data); })
      .catch((e) => { if (!cancelled) setErr(e.message || "Couldn't load this restaurant."); });
    // Best-effort, separate from the main load - a stats number failing
    // to load shouldn't block seeing the crowns themselves.
    loadRestaurantVisitCount(restaurant.name, restaurant.address, restaurant.area, restaurant.googlePlaceId)
      .then((n) => { if (!cancelled) setVisitCount(n); })
      .catch(() => { if (!cancelled) setVisitCount(null); });
    loadRestaurantWantingCount(restaurant.name, restaurant.address, restaurant.area, restaurant.googlePlaceId)
      .then((n) => { if (!cancelled) setWantingCount(n); })
      .catch(() => { if (!cancelled) setWantingCount(null); });
    return () => { cancelled = true; };
  }, [restaurant.name, restaurant.address, restaurant.area, restaurant.googlePlaceId]);

  return (
    <div data-modal-backdrop className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" tabIndex={-1} className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-5 pb-3" style={{ background: C.card, borderBottom: `1px solid ${C.cardEdge}` }}>
          <div className="min-w-0">
            <h3 className="truncate text-lg" style={{ ...display, fontWeight: 700 }}>{restaurant.name}</h3>
            <p className="truncate text-xs" style={{ color: C.muted }}>{[restaurant.area, restaurant.address].filter(Boolean).join(" · ")}</p>
            {slug && (
              <a href={`/r/${slug}`} target="_blank" rel="noopener" className="mt-1 inline-flex items-center gap-1 text-xs font-bold" style={{ color: C.goldText }}>
                Restaurant page <ExternalLink size={10} />
              </a>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center" style={{ color: C.muted }}><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {entries && entries.length > 0 && (
            <div className="mb-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl p-3 text-center" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
                <div className="text-xl" style={{ ...display, fontWeight: 700, color: C.goldText }}>{entries.length}</div>
                <div className="text-xs" style={{ color: C.muted }}>{entries.length === 1 ? "crown" : "crowns"}</div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
                <div className="text-xl" style={{ ...display, fontWeight: 700, color: C.goldText }}>{wantingCount === null ? "-" : wantingCount}</div>
                <div className="text-xs" style={{ color: C.muted }}>want to try</div>
              </div>
              <div className="rounded-xl p-3 text-center" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
                <div className="text-xl" style={{ ...display, fontWeight: 700, color: C.goldText }}>{visitCount === null ? "-" : visitCount}</div>
                <div className="text-xs" style={{ color: C.muted }}>been, not crowned</div>
              </div>
            </div>
          )}
          {err && <p className="text-sm" style={{ color: C.coup }}>{err}</p>}
          {!entries && !err && <RowSkeleton count={3} />}
          {entries && entries.length === 0 && <p className="text-sm" style={{ color: C.muted }}>No public crowns found for this one.</p>}
          {entries && entries.map((e) => (
            <div key={e.id} className="mb-4 border-b pb-4 last:mb-0 last:border-0 last:pb-0" style={{ borderColor: C.cardEdge }}>
              <div className="flex items-center gap-2">
                <Avatar url={e.avatarUrl} size={28} />
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-semibold">{e.displayName || (e.username ? `@${e.username}` : "Someone")}</span>
                  {e.cuisine && <span className="ml-1.5 text-xs" style={{ color: C.muted }}>crowned it {e.cuisine}</span>}
                </div>
                {e.rating && <span className="flex shrink-0 items-center gap-0.5 text-xs" style={{ color: C.goldText }}><Star size={11} fill={C.gold} /> {e.rating}</span>}
              </div>
              {e.decree && <p className="mt-1.5 text-sm leading-relaxed">{e.decree}</p>}
              <PhotoStrip photos={e.photos} />
              <div className="mt-1.5 flex items-center gap-3 text-xs" style={{ color: C.muted }}>
                <span>crowned {fmt(e.crownedAt)}</span>
                {safeMapsUrl(e.mapsUrl) && <a href={safeMapsUrl(e.mapsUrl)} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 font-semibold" style={{ color: C.goldText }}>Map <ExternalLink size={10} /></a>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// One-time, non-dismissable first-run step - a brand new signup (email
// or Google) lands with an auto-generated username like "steve-8f3a"
// that reads fine internally but poorly to a cold Instagram contact.
// Pre-filling the cleaned-up slug (stripping the random suffix the
// handle_new_user() trigger appends) means most people can just tap
// Continue, while anyone who cares can still change it right here.
export function WelcomeModal({ profile, onChangeAvatar, onSubmit }) {
  const suggested = (profile?.username || "").replace(/-[0-9a-f]{4}$/, "");
  const [displayName, setDisplayName] = useState(profile?.display_name || suggested);
  const [username, setUsername] = useState(suggested);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const usernameValid = /^[a-z0-9-]{3,30}$/.test(username.trim().toLowerCase());

  const save = async () => {
    if (!usernameValid || busy) return;
    setBusy(true); setErr("");
    try {
      await onSubmit({ username: username.trim().toLowerCase(), display_name: displayName.trim() || null });
    } catch (e) {
      setErr(e.message || "Couldn't save. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-5" style={{ background: "rgba(10,5,16,0.92)" }}>
      <div className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
        <Crown size={30} className="mx-auto" style={{ color: C.goldText }} fill={C.gold} strokeWidth={0} />
        <h2 className="mt-2 text-xl" style={{ ...display, fontWeight: 900 }}>Welcome to Nomarchy</h2>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>Long live your favourites. First, make this yours.</p>

        <div className="mt-4 flex justify-center">
          <AvatarPicker userId={profile?.id} url={profile?.avatar_url} onChange={onChangeAvatar} />
        </div>

        <div className="mt-4 text-left">
          <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>What should we call you?</label>
          <input aria-label="Your name"
            autoFocus
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            maxLength={40}
            className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
          />
          <div className="mt-1 text-xs" style={{ color: C.muted }}>
            What friends see on your picks, Court, and profile.
          </div>
        </div>

        <div className="mt-3 text-left">
          <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Pick a handle</label>
          <input aria-label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="lowercase, letters/numbers/hyphens"
            className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
          />
          <div className="mt-1 text-xs" style={{ color: usernameValid || !username ? C.muted : C.coup }}>
            What friends use to follow you (@{username.trim().toLowerCase() || "username"}).
          </div>
        </div>

        {err && <p className="mt-3 text-xs" style={{ color: C.coup }}>{err}</p>}

        <button
          disabled={!usernameValid || busy}
          onClick={save}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold"
          style={usernameValid ? { background: C.gold, color: C.onGold } : { background: C.cardEdge, color: C.muted }}
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

// The promotion celebration - a full-screen takeover, not a toast, since
// crossing a rank threshold should feel like an event worth stopping for.
// `rank` is the one just reached (see the useEffect that triggers this in
// the main component); `nextRank` is undefined at the very top of the
// ladder (Monarch of Taste), which is handled below rather than crashing.
export function PromotionModal({ rank, nextRank, score, thrones, reviewCount, profile, onShare, onClose }) {
  const name = profile?.display_name || profile?.username || "Friend";
  const proclamation = (rank.proclamation || "").replace("{name}", name);

  return (
    <div data-modal-backdrop className="fixed inset-0 z-[1150] flex items-center justify-center p-5" style={{ background: "rgba(10,5,16,0.92)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-2xl p-6 text-center" style={{ background: C.card, border: `1px solid ${C.gold}` }} onClick={(e) => e.stopPropagation()}>
        <Crown size={34} className="mx-auto" style={{ color: C.goldText }} fill={C.gold} strokeWidth={0} />
        <p className="mt-2 text-xs font-bold uppercase" style={{ color: C.goldText, letterSpacing: "0.14em" }}>You've been promoted</p>
        <h2 className="mt-1 text-2xl" style={{ ...display, fontWeight: 900 }}>{rank.title}</h2>

        <p className="mt-4 text-sm italic leading-relaxed" style={{ color: C.cream }}>&ldquo;{proclamation}&rdquo;</p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-xl p-2.5" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
            <div className="text-lg" style={{ ...display, fontWeight: 700, color: C.goldText }}>{score}</div>
            <div className="text-[10px] uppercase" style={{ color: C.muted, letterSpacing: "0.06em" }}>Credibility</div>
          </div>
          <div className="rounded-xl p-2.5" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
            <div className="text-lg" style={{ ...display, fontWeight: 700, color: C.goldText }}>{thrones}</div>
            <div className="text-[10px] uppercase" style={{ color: C.muted, letterSpacing: "0.06em" }}>Thrones</div>
          </div>
          <div className="rounded-xl p-2.5" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
            <div className="text-lg" style={{ ...display, fontWeight: 700, color: C.goldText }}>{reviewCount}</div>
            <div className="text-[10px] uppercase" style={{ color: C.muted, letterSpacing: "0.06em" }}>Reviews</div>
          </div>
        </div>

        {nextRank ? (
          <p className="mt-4 text-xs" style={{ color: C.muted }}>
            <span style={{ color: C.goldText, fontWeight: 700 }}>{nextRank.min - score}</span> more to {nextRank.title}
          </p>
        ) : (
          <p className="mt-4 text-xs" style={{ color: C.muted }}>There is no higher seat. The realm is yours.</p>
        )}

        <div className="mt-5 flex gap-2">
          <button onClick={onShare} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-3 text-sm font-bold" style={{ border: `1px solid ${C.gold}66`, color: C.goldText }}>
            <Share2 size={14} /> Share
          </button>
          <button onClick={onClose} className="flex-1 rounded-lg py-3 text-sm font-bold" style={{ background: C.gold, color: C.onGold }}>
            Long may I reign
          </button>
        </div>
      </div>
    </div>
  );
}

export function FriendKingdomModal({ friend: f, closedIds, highlight, onClose, onEndorse, onAddToList, onBlock, onReport }) {
  const specialty = knownFor(f);
  // Opened from a notification: scroll that crown or review into view and
  // ring it in gold so it's obvious which one the notification meant.
  const highlightRef = useRef(null);
  const isHighlighted = (kind, id) => highlight?.kind === kind && highlight.id === id;
  useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: "center" });
  }, [highlight]);
  const [reporting, setReporting] = useState(false);
  const [reportText, setReportText] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);

  const submitReport = async () => {
    await onReport(reportText);
    setReportText("");
    setReporting(false);
    setReportSent(true);
  };

  return (
    <div data-modal-backdrop className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" tabIndex={-1} className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Avatar url={f.avatarUrl} size={36} />
            <div>
              <h3 className="flex items-center gap-1.5 text-lg" style={{ ...display, fontWeight: 700 }}>
                {f.name} <RankBadge score={f.score} /> {f.isOwner && <OwnerBadge />}
              </h3>
              <span
                className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                style={{ background: C.bg, color: C.goldText, letterSpacing: "0.06em" }}
              >
                {getTitle(f.isOwner, f.score)}
              </span>
              <p className="mt-1 text-xs" style={{ color: C.muted }}>
                {f.followerCount} follower{f.followerCount === 1 ? "" : "s"}
              </p>
              {specialty && (
                <p className="mt-0.5 text-xs" style={{ color: C.muted }}>
                  Known for <span style={{ color: C.goldText, fontWeight: 700 }}>{specialty.cuisine}</span>
                  {specialty.endorsements > 0 && ` · pick endorsed by ${specialty.endorsements}`}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ color: C.muted }}><X size={18} /></button>
        </div>

        {f.picks.length === 0 && f.reviews.length === 0 && <p className="mt-4 text-sm" style={{ color: C.muted }}>No thrones claimed yet.</p>}

        {f.picks.map((p) => (
          <div key={p.id} ref={isHighlighted("crown", p.id) ? highlightRef : undefined} className="mt-3 rounded-lg p-3"
            style={{ background: C.bg, border: isHighlighted("crown", p.id) ? `2px solid ${C.gold}` : `1px solid ${C.cardEdge}` }}>
            <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>{p.cuisine}</div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <div><span style={{ ...display, fontWeight: 700 }} className="text-base">{p.name}</span><span className="ml-2 text-xs" style={{ color: C.muted }}>{p.area}</span>{p.googlePlaceId && closedIds?.has(p.googlePlaceId) && <span className="ml-2"><ClosedBadge /></span>}</div>
              <button onClick={() => onEndorse(p.id, p.endorsedByMe)} aria-label={p.endorsedByMe ? "Endorsed - tap to take it back" : "Endorse: agree with this pick"} title={p.endorsedByMe ? "Endorsed - tap to take it back" : "Endorse: agree with this pick"} className="flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold"
                style={p.endorsedByMe ? { background: C.gold, color: C.onGold } : { border: `1px solid ${C.cardEdge}`, color: C.muted }}>
                <Crown size={12} /> {p.endorsedByMe ? "Endorsed" : "Endorse"}
              </button>
            </div>
            <p className="mt-1.5 text-sm italic leading-relaxed" style={{ color: C.cream + "CC" }}>&ldquo;{p.decree}&rdquo;</p>
            <PhotoStrip photos={p.photos} />
            {!(p.googlePlaceId && closedIds?.has(p.googlePlaceId)) && (
              <button onClick={() => onAddToList(f.name, p)}
                className="mt-2 flex items-center gap-1.5 text-xs font-bold" style={{ color: C.goldText }}><Bookmark size={12} /> Add to my list</button>
            )}
          </div>
        ))}

        {f.reviews.length > 0 && (
          <div className="mt-4 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Been to, not crowned</div>
        )}
        {f.reviews.map((r) => (
          <div key={r.id} ref={isHighlighted("review", r.id) ? highlightRef : undefined} className="mt-2 rounded-lg p-3"
            style={{ background: C.bg, border: isHighlighted("review", r.id) ? `2px solid ${C.gold}` : `1px dashed ${C.cardEdge}` }}>
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

        <div className="mt-5 border-t pt-4" style={{ borderColor: C.cardEdge }}>
          {reportSent ? (
            <p className="text-xs" style={{ color: C.muted }}>Report sent - thanks for flagging it.</p>
          ) : reporting ? (
            <div>
              <textarea aria-label="Reason for report (optional)"
                value={reportText}
                onChange={(e) => setReportText(e.target.value)}
                placeholder="What's wrong? (optional)"
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
              />
              <div className="mt-2 flex gap-2">
                <button onClick={() => setReporting(false)} className="flex-1 rounded-lg py-2 text-xs font-bold" style={{ border: `1px solid ${C.cardEdge}`, color: C.muted }}>Cancel</button>
                <button onClick={submitReport} className="flex-1 rounded-lg py-2 text-xs font-bold" style={{ background: C.coup, color: C.onCoup }}>Send report</button>
              </div>
            </div>
          ) : confirmingBlock ? (
            <div>
              <p className="text-xs leading-relaxed" style={{ color: C.coup }}>
                Block {f.name}? You&apos;ll unfollow each other and won&apos;t be able to follow again unless you unblock them later (Profile &rarr; Blocked users).
              </p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setConfirmingBlock(false)} className="flex-1 rounded-lg py-2 text-xs font-bold" style={{ border: `1px solid ${C.cardEdge}`, color: C.muted }}>Cancel</button>
                <button onClick={onBlock} className="flex-1 rounded-lg py-2 text-xs font-bold" style={{ background: C.coup, color: C.onCoup }}>Block</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setReporting(true)} className="flex-1 rounded-lg py-2 text-xs font-semibold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}>Report</button>
              <button onClick={() => setConfirmingBlock(true)} className="flex-1 rounded-lg py-2 text-xs font-semibold" style={{ color: C.coup, border: `1px solid ${C.coup}55` }}>Block</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function MembersModal({ userId, onFollow, onClose }) {
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
    <div data-modal-backdrop className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" tabIndex={-1} className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>Find people</h3>
          <button onClick={onClose} aria-label="Close" style={{ color: C.muted }}><X size={18} /></button>
        </div>

        {err && <p className="mt-3 text-xs" style={{ color: C.coup }}>{err}</p>}

        {suggested && suggested.length > 0 && (
          <div className="mt-4">
            <div className="text-xs font-bold uppercase" style={{ color: C.goldText, letterSpacing: "0.1em" }}>Suggested for you</div>
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
          <div className="text-xs font-bold uppercase" style={{ color: C.goldText, letterSpacing: "0.1em" }}>Public profiles</div>
          <p className="mt-0.5 text-xs" style={{ color: C.muted }}>People who&apos;ve chosen to be discoverable by anyone.</p>
          {!members && <RowSkeleton count={4} />}
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

export function FeedbackModal({ onClose, onSubmit, initialMessage = "" }) {
  const [message, setMessage] = useState(initialMessage);
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
    <div data-modal-backdrop className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" tabIndex={-1} className="w-full max-w-sm rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>Feedback</h3>
          <button onClick={onClose} aria-label="Close" style={{ color: C.muted }}><X size={18} /></button>
        </div>

        {sent ? (
          <div className="mt-4 text-center">
            <Check size={22} className="mx-auto" style={{ color: C.green }} />
            <p className="mt-2 text-sm" style={{ color: C.muted }}>Got it, thank you.</p>
            <button onClick={onClose} className="mt-4 w-full rounded-lg py-2.5 text-sm font-bold" style={{ background: C.gold, color: C.onGold }}>Close</button>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm" style={{ color: C.muted }}>
              Found a bug, something confusing, or an idea? Say as much or as little as you like.
            </p>
            <textarea aria-label="Feedback message"
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
              style={message.trim() ? { background: C.gold, color: C.onGold } : { background: C.cardEdge, color: C.muted }}
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

export function PlaceModal({ mode, cuisineId, cuisineName, cuisines, prefill, reigning, defaultCity, userId, closedIds, onClose, onSubmit }) {
  const isCoup = mode === "coup"; const isPretender = mode === "pretender";
  // A crown or coup in progress is kept on this device as it's typed (see
  // lib/decreeDrafts.js), so closing the pop-up by accident doesn't lose a
  // half-written decree. One draft per cuisine slot, and per place when
  // crowning something from Next in Line.
  const draftKey = isPretender ? null : `${mode}:${cuisineId}:${prefill?.name || ""}`;
  const [draft] = useState(() => (draftKey ? loadDraft(userId, draftKey) : null));
  const [showRestored, setShowRestored] = useState(!!draft);
  const [cz, setCz] = useState(draft?.cz && cuisines.some((c) => c.id === draft.cz) ? draft.cz : cuisineId);
  const [czTouched, setCzTouched] = useState(false);
  const [czSuggested, setCzSuggested] = useState("");
  const [query, setQuery] = useState(draft?.query ?? (prefill?.name || ""));
  const [city, setCity] = useState(draft?.city ?? (defaultCity || "Toronto"));
  const [results, setResults] = useState([]);
  const [fuzzy, setFuzzy] = useState(false);
  const [fromGoogle, setFromGoogle] = useState(false);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(draft ? draft.sel ?? null : prefill?.mapsUrl ? prefill : null);
  const [name, setName] = useState(draft?.name ?? (prefill?.name || ""));
  const [area, setArea] = useState(draft?.area ?? (prefill?.area || ""));
  const [text, setText] = useState(draft?.text ?? "");
  const [photos, setPhotos] = useState(draft?.photos ?? (prefill?.photos || []));
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (draftKey) saveDraft(userId, draftKey, { text, name, area, city, query, sel, photos, cz });
  }, [draftKey, userId, text, name, area, city, query, sel, photos, cz]);

  const startOver = () => {
    clearDraft(userId, draftKey);
    setText(""); setName(prefill?.name || ""); setArea(prefill?.area || ""); setQuery(prefill?.name || "");
    setCity(defaultCity || "Toronto"); setSel(prefill?.mapsUrl ? prefill : null); setPhotos(prefill?.photos || []);
    setCz(cuisineId); setResults([]); setShowRestored(false);
  };
  const minLen = isPretender ? 0 : MIN_DECREE_LENGTH;
  const valid = name.trim().length > 1 && text.trim().length >= minLen && !!cz;
  const czName = cuisines.find((c) => c.id === cz)?.name || cuisineName;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true); setErr("");
    try {
      await onSubmit(cz, { name: name.trim().toUpperCase(), area: area.trim(), ...(isPretender ? { note: text.trim() } : { decree: text.trim(), photos }), address: sel?.address || "", rating: sel?.rating || "", mapsUrl: sel?.mapsUrl || "", googlePlaceId: sel?.googlePlaceId || null, lat: sel?.lat ?? null, lng: sel?.lng ?? null, city: city.trim() || defaultCity || null });
      if (draftKey) clearDraft(userId, draftKey);
    } catch (e) {
      setErr(e.message || "That didn't save - try again.");
    }
    setSubmitting(false);
  };

  const find = async () => {
    if (!query.trim() || searching) return;
    setSearching(true); setErr(""); setResults([]); setFuzzy(false); setFromGoogle(false); setSel(null);
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
        setFromGoogle(!!data.google);
      } else {
        setErr("No matches found. Fill in the details manually below.");
      }
    } catch (e) {
      setErr(e.message || "Lookup didn't work. Fill in the details manually below.");
    }
    setSearching(false);
  };

  // For Next in Line, a Google result also suggests the cuisine from its
  // category - but never over one the person picked themselves, and only
  // when the name matches a cuisine in their own list.
  const isClosedResult = (r) => !!r?.googlePlaceId && !!closedIds?.has(r.googlePlaceId);
  const choose = (r) => {
    if (isClosedResult(r)) return;
    setSel(r); setName(r.name || ""); setArea(r.neighbourhood || ""); setResults([]); setFuzzy(false);
    if (isPretender && !czTouched) {
      const suggested = suggestCuisineName(r.primaryType, r.types);
      const match = suggested && cuisines.find((c) => c.name.toLowerCase() === suggested.toLowerCase());
      if (match) { setCz(match.id); setCzSuggested(match.name); }
    }
  };

  return (
    <div data-modal-backdrop className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" tabIndex={-1} className="max-h-screen w-full max-w-md overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>
            {isPretender ? "Add to Next in Line" : isCoup ? `Stage a coup · ${czName}` : `Crown your ${czName} spot`}
          </h3>
          <button onClick={onClose} aria-label="Close" style={{ color: C.muted }}><X size={18} /></button>
        </div>

        {isCoup && (
          <p className="mt-2 text-xs" style={{ color: C.muted }}>
            A coup replaces your current favourite with a better place. The old one is kept in your history.
          </p>)}
        {isCoup && reigning && (
          <p className="mt-2 rounded-lg p-2.5 text-xs" style={{ background: C.bg, color: C.muted, border: `1px solid ${C.cardEdge}` }}>
            <Crown size={11} className="mr-1 inline" style={{ color: C.goldText }} />{reigning.name} holds this throne. Your decree must say why the new spot takes it.
          </p>)}

        {(isPretender || prefill) && (<div className="mt-3">
          <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Cuisine</label>
          <select aria-label="Cuisine" value={cz} onChange={(e) => { setCz(e.target.value); setCzTouched(true); setCzSuggested(""); }} className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: cz ? C.cream : C.muted }}>
            {!cz && <option value="">Choose a cuisine...</option>}
            {cuisines.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {czSuggested && <p className="mt-1 text-[10px]" style={{ color: C.muted }}>Suggested from Google: {czSuggested}. Change it if that&apos;s not right.</p>}
        </div>)}

        <div className="mt-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Find the real place</div>
          <div className="mt-2 flex gap-2">
            <input aria-label="Restaurant name to search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} placeholder="Restaurant name" className="w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
            <input aria-label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="w-24 rounded-lg px-2 py-2.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
          </div>
          <button onClick={find} disabled={searching || !query.trim()} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold" style={searching || !query.trim() ? { background: C.cardEdge, color: C.muted } : { background: C.gold, color: C.onGold }}>
            {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}{searching ? "Searching the realm..." : "Look it up"}
          </button>
          {err && <p className="mt-2 text-xs" style={{ color: C.coup }}>{err}</p>}
          {fuzzy && results.length > 0 && (
            <p className="mt-2 text-xs font-bold uppercase" style={{ color: C.goldText, letterSpacing: "0.1em" }}>Did you mean?</p>
          )}
          {results.map((r, i) => (
            <button key={i} onClick={() => choose(r)} disabled={isClosedResult(r)} className="mt-2 w-full rounded-lg p-2.5 text-left" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, opacity: isClosedResult(r) ? 0.55 : 1 }}>
              <div className="flex items-center justify-between gap-2"><span className="flex flex-wrap items-center gap-1.5 text-sm font-bold">{r.name}{isClosedResult(r) && <ClosedBadge />}</span>
                {r.rating && <span className="flex items-center gap-0.5 text-xs" style={{ color: C.goldText }}><Star size={11} fill={C.gold} /> {r.rating}</span>}</div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>{[r.neighbourhood, r.address].filter(Boolean).join(" · ")}</div>
            </button>))}
          {fromGoogle && results.length > 0 && (
            <p className="mt-2 text-right text-[10px]" style={{ color: C.muted }}>Results from Google Maps</p>
          )}
          {sel && (<div className="mt-2 flex items-start justify-between rounded-lg p-2.5" style={{ border: `1px solid ${C.green}66`, background: C.green + "11" }}>
            <div><div className="text-sm font-bold" style={{ color: C.green }}>{sel.name}</div>
              <div className="text-xs" style={{ color: C.muted }}>{[sel.neighbourhood || sel.area, sel.address].filter(Boolean).join(" · ")}</div></div>
            {safeMapsUrl(sel.mapsUrl) && <a href={safeMapsUrl(sel.mapsUrl)} target="_blank" rel="noreferrer" className="flex items-center gap-0.5 text-xs font-semibold" style={{ color: C.green }}>Map <ExternalLink size={10} /></a>}
          </div>)}
          {sel?.googlePlaceId && <p className="mt-1.5 text-right text-[10px]" style={{ color: C.muted }}>Place details from Google Maps</p>}
        </div>

        <input aria-label="Restaurant name" value={name} onChange={(e) => { setName(e.target.value); if (sel && e.target.value !== sel.name) setSel(null); }} placeholder="Restaurant name" className="mt-3 w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
        <input aria-label="Neighbourhood (optional)" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Neighbourhood (optional)" className="mt-2 w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
        {showRestored && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: C.gold + "1A", border: `1px solid ${C.gold}66`, color: C.cream }}>
            <span>Picked up where you left off - your unsaved decree is back.</span>
            <button type="button" onClick={startOver} className="shrink-0 font-bold underline" style={{ color: C.goldText }}>Start over</button>
          </div>
        )}
        <textarea aria-label={isPretender ? "Why you want to go" : "Your decree (why it's your favourite)"} value={text} onChange={(e) => setText(e.target.value)} rows={isPretender ? 2 : 4}
          placeholder={isPretender ? "Why do you want to go? (optional)" : isCoup ? "The decree: why does this dethrone the reigning spot?" : "The decree: what makes this your one true spot?"}
          className="mt-2 w-full rounded-lg px-3 py-2.5 text-sm outline-none" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
        {!isPretender && (<div className="mt-1 text-right text-xs" style={{ color: text.trim().length >= minLen ? C.green : C.muted }}>
          {text.trim().length}/{minLen} minimum. No throne without a decree.
        </div>)}
        {!isPretender && <PhotoPicker userId={userId} photos={photos} onChange={setPhotos} removeInViewer />}

        <button disabled={!valid || submitting} onClick={handleSubmit}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold"
          style={valid && !submitting ? { background: isCoup ? C.coup : C.gold, color: isCoup ? C.onCoup : C.onGold } : { background: C.cardEdge, color: C.muted }}>
          {submitting ? <Loader2 size={15} className="animate-spin" /> : isPretender ? <Bookmark size={15} /> : isCoup ? <Swords size={15} /> : <Crown size={15} />}
          {submitting ? "Saving..." : isPretender ? "Add to Next in Line" : isCoup ? "Dethrone and crown" : "Crown this spot"}
        </button>
      </div>
    </div>);
}

export function ImportModal({ cuisineNames, onClose, onImport }) {
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
    <div data-modal-backdrop className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" tabIndex={-1} className="max-h-screen w-full max-w-md overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>Import your list</h3>
          <button onClick={onClose} aria-label="Close" style={{ color: C.muted }}><X size={18} /></button>
        </div>

        {!rows ? (<>
          <p className="mt-2 text-sm" style={{ color: C.muted }}>
            Paste it in however it comes. Notes, a CSV, a screenshot&apos;s worth of text, a rambling list from the group chat. It&apos;ll sort out the mess.
          </p>
          <textarea aria-label="Your list to import" value={raw} onChange={(e) => setRaw(e.target.value)} rows={8} maxLength={MAX_IMPORT_CHARS}
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
            style={working || !raw.trim() ? { background: C.cardEdge, color: C.muted } : { background: C.gold, color: C.onGold }}>
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
                  <input aria-label="Restaurant name"
                    value={r.name}
                    onChange={(e) => update(r._id, "name", e.target.value)}
                    className="flex-1 rounded bg-transparent px-1 py-0.5 text-sm font-bold outline-none"
                    style={{ color: C.cream }}
                  />
                  <button onClick={() => update(r._id, "_keep", !r._keep)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                    style={r._keep ? { background: C.gold, color: C.onGold } : { border: `1px solid ${C.cardEdge}` }}>
                    {r._keep && <Check size={12} strokeWidth={3} />}
                  </button>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <select aria-label="Cuisine" value={r.cuisine} onChange={(e) => update(r._id, "cuisine", e.target.value)} className="shrink-0 rounded px-2 py-1 text-xs outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: r.cuisine ? C.cream : C.muted }}>
                    {!r.cuisine && <option value="">Choose a cuisine...</option>}
                    {[...new Set([r.cuisine, ...cuisineNames].filter(Boolean))].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input aria-label="Area"
                    value={r.area || ""}
                    onChange={(e) => update(r._id, "area", e.target.value)}
                    placeholder="area"
                    className="flex-1 rounded px-2 py-1 text-xs outline-none"
                    style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }}
                  />
                </div>
                <input aria-label="Note"
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
              style={keeping.length && !confirming ? { background: C.gold, color: C.onGold } : { background: C.cardEdge, color: C.muted }}>
              {confirming ? <Loader2 size={15} className="animate-spin" /> : <Bookmark size={15} />}
              {confirming ? "Adding..." : `Add ${keeping.length} to Next in Line`}
            </button>
          </div>
        </>)}
      </div>
    </div>);
}
