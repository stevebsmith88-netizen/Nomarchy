"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Crown, MapPin, ExternalLink, ScrollText, UserPlus, Loader2, Check, Lock, X, ChevronLeft, ChevronRight } from "lucide-react";
import { getUser, loadPublicKingdom, followByUsername } from "@/lib/data";
import { C, display, getTitle, RankBadge, OwnerBadge, LogoMark, FontShell, useTheme } from "../theme";

// Matches the reserved cuisine name seeded in schema.sql - see app/page.js
// for the fuller explanation of why the overall favourite piggybacks on
// the ordinary cuisine/throne machinery instead of its own table.
const OVERALL_FAVOURITE_NAME = "Overall Favourite";

// "emoji:<char>" is a chosen emoji avatar stored in the same avatar_url
// column as a real photo URL - see AVATAR_EMOJI/Avatar in app/page.js.
const EMOJI_PREFIX = "emoji:";

function Avatar({ url, size = 28 }) {
  if (url?.startsWith(EMOJI_PREFIX)) {
    return (
      <div className="mx-auto flex items-center justify-center rounded-full" style={{ width: size, height: size, background: C.card, border: `1px solid ${C.cardEdge}`, fontSize: Math.round(size * 0.55), lineHeight: 1 }}>
        {url.slice(EMOJI_PREFIX.length)}
      </div>
    );
  }
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="mx-auto rounded-full object-cover" style={{ width: size, height: size, border: `1px solid ${C.cardEdge}` }} />
  ) : null;
}

function PhotoStrip({ photos }) {
  const [viewingIndex, setViewingIndex] = useState(null);
  if (!photos || photos.length === 0) return null;
  const prev = () => setViewingIndex((i) => (i - 1 + photos.length) % photos.length);
  const next = () => setViewingIndex((i) => (i + 1) % photos.length);
  return (
    <>
      <div className="mt-2 flex gap-2">
        {photos.map((url, i) => (
          <div key={url} className="h-16 w-16 shrink-0 overflow-hidden rounded-lg" style={{ border: `1px solid ${C.cardEdge}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" onClick={() => setViewingIndex(i)} className="h-full w-full cursor-pointer object-cover" />
          </div>
        ))}
      </div>
      {viewingIndex !== null && (
        <div className="fixed inset-0 z-[1300] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={() => setViewingIndex(null)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex shrink-0 items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.cardEdge}` }}>
              <span className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>
                {photos.length > 1 ? `Photo ${viewingIndex + 1} of ${photos.length}` : "Photo"}
              </span>
              <button onClick={() => setViewingIndex(null)} aria-label="Close" style={{ color: C.muted }}><X size={18} /></button>
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

export default function PublicProfileClient({ username }) {
  // Subscribes this page to theme changes so a visitor who's already set a
  // light/dark preference in the main app (saved in their browser) sees it
  // respected here too - see theme.js.
  useTheme();

  const [viewer, setViewer] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [followErr, setFollowErr] = useState("");

  useEffect(() => {
    getUser().then((u) => { setViewer(u); setAuthChecked(true); });
  }, []);

  useEffect(() => {
    loadPublicKingdom(username).then((result) => {
      if (!result) setNotFound(true);
      else setData(result);
    });
  }, [username]);

  const handleFollow = async () => {
    if (!viewer || followBusy) return;
    setFollowBusy(true); setFollowErr("");
    try {
      await followByUsername(viewer.id, username);
      setFollowing(true);
    } catch (e) {
      setFollowErr(e.message);
    }
    setFollowBusy(false);
  };

  const fmt = (t) => new Date(t).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });

  if (notFound) {
    return (
      <FontShell>
        <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
          <Crown size={28} style={{ color: C.gold }} />
          <p className="mt-3 text-sm" style={{ color: C.muted }}>No kingdom at @{username}.</p>
          <Link href="/" className="mt-4 text-sm font-semibold" style={{ color: C.gold }}>Back to Nomarchy</Link>
        </div>
      </FontShell>
    );
  }

  if (!data || !authChecked) {
    return (
      <FontShell>
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm" style={{ color: C.muted }}>Loading kingdom...</p>
        </div>
      </FontShell>
    );
  }

  const { profile, slots, standing } = data;
  const isSelf = viewer && viewer.id === profile.id;
  const isPrivate = !profile.is_public && !isSelf;

  if (isPrivate) {
    return (
      <FontShell>
        <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
          <Lock size={28} style={{ color: C.muted }} />
          <h1 className="mt-3 text-xl" style={{ ...display, fontWeight: 700 }}>
            {(profile.display_name || profile.username)}&apos;s Kingdom is private
          </h1>
          <p className="mt-1 text-sm" style={{ color: C.muted }}>@{profile.username} isn&apos;t sharing this publicly.</p>
          <Link href="/" className="mt-4 text-sm font-semibold" style={{ color: C.gold }}>Back to Nomarchy</Link>
        </div>
      </FontShell>
    );
  }

  const overall = slots[OVERALL_FAVOURITE_NAME]?.current;
  const cuisineNames = Object.keys(slots)
    .filter((name) => name !== OVERALL_FAVOURITE_NAME && slots[name].current)
    .sort((a, b) => a.localeCompare(b));

  const score = standing?.score ?? 0;
  const title = getTitle(profile.is_owner, score);

  return (
    <FontShell>
      <header className="px-5 pt-7 pb-3 text-center">
        <div className="flex items-center justify-center gap-2">
          <LogoMark size={28} />
          <h1 className="flex items-center gap-1.5 text-2xl tracking-wide" style={{ ...display, fontWeight: 900 }}>
            {(profile.display_name || profile.username)}&apos;s Kingdom
            <RankBadge score={score} size={16} /> {profile.is_owner && <OwnerBadge size={16} />}
          </h1>
        </div>
        {profile.avatar_url && <div className="mt-3"><Avatar url={profile.avatar_url} size={56} /></div>}
        <p className="mt-1 text-sm italic" style={{ ...display, color: C.muted }}>
          @{profile.username}{profile.city ? ` · ${profile.city}` : ""}
        </p>

        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: C.card, color: C.gold, border: `1px solid ${C.cardEdge}` }}>
            {title}
          </span>
          {authChecked && viewer && !isSelf && (
            <button
              onClick={handleFollow}
              disabled={following || followBusy}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
              style={following ? { background: C.green + "22", color: C.green, border: `1px solid ${C.green}66` } : { background: C.gold, color: C.bg }}
            >
              {followBusy ? <Loader2 size={12} className="animate-spin" /> : following ? <Check size={12} /> : <UserPlus size={12} />}
              {following ? "Following" : "Follow"}
            </button>
          )}
        </div>
        {followErr && <p className="mt-2 text-xs" style={{ color: C.coup }}>{followErr}</p>}
        {authChecked && !viewer && (
          <p className="mt-2 text-xs" style={{ color: C.muted }}>
            <Link href="/" style={{ color: C.gold }}>Sign in to Nomarchy</Link> to follow @{profile.username}.
          </p>
        )}
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-16">
        {overall && (
          <div className="mb-5 rounded-xl p-4" style={{ background: C.card, border: `2px solid ${C.gold}55`, boxShadow: `0 0 0 1px ${C.gold}33` }}>
            <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.14em" }}>Overall Favourite</div>
            <h3 className="mt-2 text-2xl" style={{ ...display, fontWeight: 700 }}>{overall.name}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs" style={{ color: C.muted }}>
              {(overall.area || overall.address) && (<><MapPin size={11} /> {overall.area || overall.address}<span className="mx-1">·</span></>)}
              crowned {fmt(overall.crownedAt)}
              {overall.mapsUrl && <a href={overall.mapsUrl} target="_blank" rel="noreferrer" className="ml-1 flex items-center gap-0.5 font-semibold" style={{ color: C.gold }}>Map <ExternalLink size={10} /></a>}
            </div>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: C.cream + "E6" }}>
              <ScrollText size={13} className="mr-1 inline" style={{ color: C.gold }} />{overall.decree}
            </p>
            <PhotoStrip photos={overall.photos} />
          </div>
        )}

        {cuisineNames.length === 0 ? (
          <div className="rounded-xl p-6 text-center" style={{ background: C.card, border: `1px dashed ${C.cardEdge}` }}>
            <p className="text-sm" style={{ color: C.muted }}>No thrones claimed yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cuisineNames.map((cuisineName) => {
              const r = slots[cuisineName].current;
              return (
                <div key={cuisineName} className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.gold}55` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.14em" }}>{cuisineName}</span>
                    <Crown size={16} style={{ color: C.gold }} fill={C.gold} strokeWidth={0} />
                  </div>
                  <h3 className="mt-2 text-xl" style={{ ...display, fontWeight: 700 }}>{r.name}</h3>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs" style={{ color: C.muted }}>
                    {(r.area || r.address) && (<><MapPin size={11} /> {r.area || r.address}<span className="mx-1">·</span></>)}
                    crowned {fmt(r.crownedAt)}
                    {r.mapsUrl && <a href={r.mapsUrl} target="_blank" rel="noreferrer" className="ml-1 flex items-center gap-0.5 font-semibold" style={{ color: C.gold }}>Map <ExternalLink size={10} /></a>}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: C.cream + "E6" }}>
                    <ScrollText size={13} className="mr-1 inline" style={{ color: C.gold }} />{r.decree}
                  </p>
                  <PhotoStrip photos={r.photos} />
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-8 text-center text-xs" style={{ color: C.muted }}>
          <Link href="/" style={{ color: C.gold }}>Start your own kingdom on Nomarchy</Link>
        </p>
      </main>
    </FontShell>
  );
}
