"use client";

import { useState } from "react";
import { C, OwnerBadge, RANKS, display, getRank } from "../theme";
import { MAX_REVIEW_PHOTOS, deleteReviewPhoto, uploadAvatar, uploadReviewPhoto } from "@/lib/data";
import { safeMapsUrl } from "@/lib/safeUrl";
import { Camera, ChevronDown, ChevronLeft, ChevronRight, Crown, ExternalLink, Loader2, Trash2, UserPlus, Users, X } from "lucide-react";

export const MIN_DECREE_LENGTH = 30;

export const MAX_IMPORT_CHARS = 20000;

// Module scope, evaluated once when the page loads - not inside the
// component, where calling Date.now() directly would be an impure render
// (react-hooks/purity). A Trending range like "this week" doesn't need
// to be precise to the second anyway, just roughly right for the session.
export const NOW = Date.now();

export const RANGE_MS = { all: Infinity, year: 365 * 86400000, month: 30 * 86400000, week: 7 * 86400000 };

// A reserved, shared cuisine row (seeded in schema.sql) that every user gets
// their own throne on via the normal unique(user_id, cuisine_id) constraint.
// Reusing the cuisine/throne machinery for this means the overall favourite
// gets crowning, coups and history for free, with no separate table.
export const OVERALL_FAVOURITE_NAME = "Overall Favourite";

// Import-extracted names can carry stray formatting a canonical, looked-up
// name won't ("Writers room -" vs "Writers room"), so an exact string match
// misses obvious duplicates. Strip trailing separator punctuation and
// collapse whitespace before comparing.
export const normalizeName = (name) =>
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
export const sameRestaurant = (a, b) => {
  const na = normalizeName(a), nb = normalizeName(b);
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 5 && longer.includes(shorter);
};

// For the notification feed - "3h ago" reads as a real timeline, where a
// full date on every row would just be noise for anything from today.
export const timeAgo = (at) => {
  const ms = Date.now() - new Date(at).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(at).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
};

// Marking something "been" with nothing typed and no verdict chosen used
// to just leave the note blank - indistinguishable from "haven't written
// one yet." One of these gets written in instead, so it's obvious at a
// glance that nothing was said, not that a review is still pending. Same
// visibility as a real note (friends only, never the public page) and it
// still counts toward "reviews written" - a is a is a note as far as the
// rest of the app is concerned.
export const CORNY_VISIT_NOTES = [
  "The Crown attended, but left no proclamation.",
  "A visit was paid. Words failed the royal scribe.",
  "Present and accounted for. No decree was issued.",
  "The throne was visited. History records nothing further.",
  "Attendance confirmed. Commentary respectfully withheld.",
  "Here, apparently. The royal ledger says nothing else.",
];

export function RankLadder({ score }) {
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
              <span className="text-sm" style={{ color: isCurrent ? C.goldText : reached ? C.cream : C.muted, fontWeight: isCurrent ? 700 : 500 }}>
                {r.title}
              </span>
              {isCurrent && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: C.gold, color: C.onGold, letterSpacing: "0.06em" }}>
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

// An avatar is either a real uploaded photo (a URL) or a chosen emoji,
// stored as "emoji:<char>" in the same avatar_url column - no schema
// change needed, just a prefix check here and everywhere else an avatar
// renders.
export const EMOJI_PREFIX = "emoji:";

// A plain pulsing block, composed into shapes that roughly match what's
// about to load (a few card outlines, a few rows) rather than a spinner
// or bare "Loading..." text - the shape itself signals what's coming,
// which reads as a more finished, considered app than a blank wait does.
export function Skeleton({ className = "", style }) {
  return <div className={`animate-pulse rounded-lg ${className}`} style={{ background: C.cardEdge, ...style }} />;
}

export function RowSkeleton({ count = 3 }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="mb-2 flex items-center gap-3 rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="mt-2 h-2.5 w-1/3" />
          </div>
        </div>
      ))}
    </>
  );
}

export function Avatar({ url, size = 28 }) {
  if (url?.startsWith(EMOJI_PREFIX)) {
    return (
      <div className="flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, background: C.card, border: `1px solid ${C.cardEdge}`, fontSize: Math.round(size * 0.55), lineHeight: 1 }}>
        {url.slice(EMOJI_PREFIX.length)}
      </div>
    );
  }
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size, border: `1px solid ${C.cardEdge}` }} />
  ) : (
    <div className="flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, background: C.card, border: `1px solid ${C.cardEdge}`, color: C.muted }}>
      <Users size={Math.round(size * 0.55)} />
    </div>
  );
}

// A curated set, not the full emoji keyboard - food/drink/kingdom themed
// with a handful of plain faces, so this stays "pick a fun avatar" rather
// than a general-purpose emoji picker.
export const AVATAR_EMOJI = [
  "😊", "😎", "🤩", "😋", "🥳", "😏",
  "🧐", "👨‍🍳", "👩‍🍳", "🍔", "🍕", "🍣",
  "🍜", "🌮", "🍦", "🍰", "🍷", "🍺",
  "☕", "🥂", "🔥", "⭐", "👑", "💎",
  "🎯", "🌈", "🦊", "🐱", "🐶", "🦋",
  "🌸", "🍀", "🌙", "✨", "🎸", "🎨",
];

// One photo, always the same storage path (a re-upload overwrites it),
// with a small camera badge to invite changing it - distinct from
// PhotoPicker below, which manages up to 3 photos on a review.
export function AvatarPicker({ userId, url, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [pickingEmoji, setPickingEmoji] = useState(false);

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
        <span className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full" style={{ background: C.gold, color: C.onGold, border: `2px solid ${C.card}` }}>
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
        </span>
        <input aria-label="Upload a profile photo" type="file" accept="image/*" onChange={handleFile} disabled={uploading} className="hidden" />
      </label>
      <button type="button" onClick={() => setPickingEmoji((v) => !v)} className="mt-2 text-xs font-semibold" style={{ color: C.muted }}>
        {pickingEmoji ? "Cancel" : "or pick an emoji instead"}
      </button>
      {pickingEmoji && (
        <div className="mt-2 grid grid-cols-6 gap-1.5 rounded-xl p-2.5" style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, maxWidth: 264 }}>
          {AVATAR_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => { onChange(`${EMOJI_PREFIX}${emoji}`); setPickingEmoji(false); }}
              className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
              style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      {err && <p className="mt-1 text-xs" style={{ color: C.coup }}>{err}</p>}
    </div>
  );
}

// One row on the Best in the Land leaderboard or in restaurant search
// results - tapping it opens that restaurant's own page (RestaurantProfileModal).
export function RestaurantRow({ p, rank, onOpen }) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
      className="mb-2 flex cursor-pointer items-center gap-3 rounded-xl p-3"
      style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}
    >
      {rank !== undefined && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ background: rank < 3 ? C.gold : C.bg, color: rank < 3 ? C.onGold : C.muted }}>{rank + 1}</div>
      )}
      <div className="min-w-0 flex-1">
        <span className="truncate text-sm font-semibold">{p.name}</span>
        <div className="truncate text-xs" style={{ color: C.muted }}>{[p.area, p.address].filter(Boolean).join(" · ")}</div>
      </div>
      <div className="shrink-0 text-right">
        {safeMapsUrl(p.mapsUrl) && (
          <a href={safeMapsUrl(p.mapsUrl)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="mb-0.5 flex items-center gap-0.5 text-xs font-semibold" style={{ color: C.goldText }}>
            Map <ExternalLink size={10} />
          </a>
        )}
        <div className="text-lg" style={{ ...display, fontWeight: 700, color: C.goldText }}>{p.count}</div>
        <div className="text-[10px] uppercase" style={{ color: C.muted, letterSpacing: "0.08em" }}>{p.count === 1 ? "crown" : "crowns"}</div>
      </div>
    </div>
  );
}

// Read-only thumbnail row - used both for the owner's own picks (paired
// with PhotoPicker below) and for reading a friend's or a public profile's
// photos, where no remove button applies.
export function PhotoStrip({ photos, onRemove, removeInViewer = false }) {
  const [viewingIndex, setViewingIndex] = useState(null);
  if (!photos || photos.length === 0) return null;
  const prev = () => setViewingIndex((i) => (i - 1 + photos.length) % photos.length);
  const next = () => setViewingIndex((i) => (i + 1) % photos.length);
  return (
    <>
      <div className="mt-2 flex gap-2">
        {photos.map((url, i) => (
          <div key={url} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg" style={{ border: `1px solid ${C.cardEdge}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" onClick={() => setViewingIndex(i)} className="h-full w-full cursor-pointer object-cover" />
            {onRemove && !removeInViewer && (
              <button onClick={() => onRemove(i)} aria-label="Remove photo" className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}>
                <X size={10} />
              </button>
            )}
          </div>
        ))}
      </div>
      {viewingIndex !== null && (
        <div data-modal-backdrop className="fixed inset-0 z-[1300] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={() => setViewingIndex(null)}>
          <div role="dialog" aria-modal="true" tabIndex={-1} className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.cardEdge}` }}>
              <span className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>
                {photos.length > 1 ? `Photo ${viewingIndex + 1} of ${photos.length}` : "Photo"}
              </span>
              <div className="flex items-center gap-4">
                {onRemove && removeInViewer && (
                  <button onClick={() => { onRemove(viewingIndex); setViewingIndex(null); }} aria-label="Delete photo" className="flex items-center gap-1 text-xs font-semibold" style={{ color: C.muted }}><Trash2 size={14} /> Delete</button>
                )}
                <button onClick={() => setViewingIndex(null)} aria-label="Close" style={{ color: C.muted }}><X size={18} /></button>
              </div>
            </div>
            {/* Fixed-height stage, not sized to each image - otherwise the
                modal itself grows or shrinks depending on whether the
                current photo happens to be wide or tall. object-contain
                still shows the whole photo, just letterboxed if needed. */}
            <div className="relative flex h-[65vh] items-center justify-center overflow-hidden" style={{ background: C.bg }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photos[viewingIndex]} alt="" className="h-full w-full object-contain" />
              {photos.length > 1 && (<>
                <button onClick={prev} aria-label="Previous photo" className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full" style={{ background: "rgba(10,5,16,0.6)", color: "#fff" }}>
                  <ChevronLeft size={18} />
                </button>
                <button onClick={next} aria-label="Next photo" className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full" style={{ background: "rgba(10,5,16,0.6)", color: "#fff" }}>
                  <ChevronRight size={18} />
                </button>
              </>)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Uploads happen the moment a photo is picked, not deferred to some later
// "save" - simpler state, and it means a review's photos are never lost to
// a closed tab mid-edit. Removing one is a local array change the caller
// persists (immediately for an existing review, or on submit for a new one).
export function PhotoPicker({ userId, photos, onChange, action, canRemove = true, removeInViewer = false }) {
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
      <PhotoStrip photos={photos} removeInViewer={removeInViewer} onRemove={canRemove ? (i) => { deleteReviewPhoto(photos[i]); onChange(photos.filter((_, idx) => idx !== i)); } : undefined} />
      {(photos.length < MAX_REVIEW_PHOTOS || action) && (
        <div className="mt-2 flex items-end justify-between gap-2">
          {photos.length < MAX_REVIEW_PHOTOS ? (
            <label className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}>
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
              {uploading ? "Uploading..." : `Add photo (${photos.length}/${MAX_REVIEW_PHOTOS})`}
              <input aria-label="Add photos" type="file" accept="image/*" multiple onChange={handleFiles} disabled={uploading} className="hidden" />
            </label>
          ) : <span className="text-xs font-semibold" style={{ color: C.muted }}>{photos.length}/{MAX_REVIEW_PHOTOS} photos</span>}
          {action}
        </div>
      )}
      {err && <p className="mt-1 text-xs" style={{ color: C.coup }}>{err}</p>}
    </div>
  );
}

export const GOOGLE_USAGE_LABELS = {
  search: "Place searches",
  backfill_search: "Backfill searches",
  place_refresh: "Coordinate refreshes",
  closure_check: "Closure checks",
  map_load: "Map loads",
};

// A curated set of food, drink and kitchen icons for a cuisine someone has
// created - the same idea as the avatar picker, but food-first. The choice
// shows on that cuisine's map pins.
export const CUISINE_EMOJI_CHOICES = [
  "🍔", "🍕", "🌭", "🌮", "🌯", "🥪", "🍟", "🍗",
  "🍖", "🥩", "🥓", "🍳", "🥞", "🧇", "🥐", "🍞",
  "🍣", "🍱", "🍙", "🍜", "🍲", "🥘", "🍛", "🍝",
  "🥗", "🥙", "🧆", "🥟", "🍤", "🦞", "🍢", "🥡",
  "🧀", "🥑", "🌶️", "🍅", "🍄", "🥦", "🥕", "🫓",
  "🍰", "🧁", "🍩", "🍪", "🍦", "🍫", "🍷", "🍸",
  "🍺", "🥂", "🍹", "🥃", "☕", "🍵", "🍽️", "🔥",
];

export function CuisineEmojiGrid({ onPick }) {
  return (
    <div className="mt-2 grid grid-cols-8 gap-1 rounded-xl p-2" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
      {CUISINE_EMOJI_CHOICES.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          aria-label={`Use ${emoji}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-lg"
          style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

// Shown wherever a place the owner has confirmed as permanently closed
// appears on a card or in a search result.
export function ClosedBadge() {
  return (
    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: C.coup + "22", color: C.coup, letterSpacing: "0.06em" }}>
      Permanently closed
    </span>
  );
}

// Google's own logomark, drawn inline so the button meets their branding
// guidelines (their four brand colors, not recolored to match the app).
export function GoogleIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.1 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.2-5.5l-6.6-5.6C29.4 34.7 26.8 35.6 24 35.6c-5.2 0-9.6-3.3-11.2-7.9l-6.6 5.1C9.5 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.4 36 44 30.6 44 24c0-1.3-.1-2.7-.4-3.5z"/>
    </svg>
  );
}

// A collapsed-by-default section for the profile - stats and conquests are
// reference material, not something to scroll past every time the profile
// opens. `right` is a small summary (like "3/8") shown beside the title
// even while it's closed.
// Collapsible section for the Admin tab. Unlike ProfileSection, the content
// stays mounted while closed (just hidden), so a running scan, a search box
// or a list of results isn't lost by collapsing it.
export function AdminSection({ title, right, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t pt-3 pb-1 text-left" style={{ borderColor: C.cardEdge }}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 pb-1">
        <span className="text-xs font-bold uppercase" style={{ color: C.goldText, letterSpacing: "0.14em" }}>{title}</span>
        <span className="flex min-w-0 items-center gap-2">
          {right && <span className="truncate text-xs" style={{ color: C.muted }}>{right}</span>}
          <ChevronDown size={15} className="shrink-0 transition-transform" style={{ color: C.muted, transform: open ? "rotate(180deg)" : "none" }} />
        </span>
      </button>
      <div className={open ? "mt-2 mb-3" : "hidden"}>{children}</div>
    </div>
  );
}

export function ProfileSection({ title, right, className = "", children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`border-t pt-3 text-left ${className || "mt-3"}`} style={{ borderColor: C.cardEdge }}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center justify-between pb-1">
        <span className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>{title}</span>
        <span className="flex items-center gap-2">
          {right && <span className="text-xs" style={{ color: C.muted }}>{right}</span>}
          <ChevronDown size={15} className="transition-transform" style={{ color: C.muted, transform: open ? "rotate(180deg)" : "none" }} />
        </span>
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function PersonRow({ p, onFollow, busy, hint }) {
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
          style={{ background: C.gold, color: C.onGold }}
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
// Auto-derived "known for": the cuisine someone has the most places in,
// counting both crowns and been-to reviews. The price/occasion tiers and
// Overall Favourite aren't cuisines, so they never count. Needs at least
// two places so one visit doesn't label anyone; ties go to the cuisine
// they've actually crowned, then alphabetically so it never flickers.
export const NOT_A_CUISINE = new Set(["Overall Favourite", "Cheap Eat", "Special Occasion", "Quick Bite"]);

export function knownFor(f) {
  const counts = new Map();
  for (const p of f.picks) if (p.cuisine && !NOT_A_CUISINE.has(p.cuisine)) counts.set(p.cuisine, (counts.get(p.cuisine) || 0) + 1);
  for (const r of f.reviews) if (r.cuisine && !NOT_A_CUISINE.has(r.cuisine)) counts.set(r.cuisine, (counts.get(r.cuisine) || 0) + 1);
  const crowned = new Set(f.picks.map((p) => p.cuisine));
  const best = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || (crowned.has(b[0]) ? 1 : 0) - (crowned.has(a[0]) ? 1 : 0) || a[0].localeCompare(b[0]))[0];
  if (!best) return null;
  const pick = f.picks.find((p) => p.cuisine === best[0]);
  return { cuisine: best[0], endorsements: pick?.endorsements || 0 };
}
