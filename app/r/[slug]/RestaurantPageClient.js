"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, Check, Crown, ExternalLink, Loader2, MapPin, Moon, Sun, Trophy } from "lucide-react";
import { C, display, FontShell, LogoMark, OwnerBadge, RankBadge, useTheme } from "../../theme";
import { getCuisineEmoji } from "../../cuisineIcons";
import { PhotoStrip } from "../../components/shared";
import { addToNextInLine, getUser, savedPlaceStatus, submitFeedback } from "@/lib/data";
import { formatDecreeReport } from "@/lib/decreeReports";
import { bestRankLabel, crownedCuisines, googleMapsUrl, kingdomPath } from "@/lib/restaurantPage";

const fmt = (t) => new Date(t).toLocaleDateString("en-CA", { month: "short", year: "numeric" });

// Same wording the app uses when a place is already saved.
const ALREADY = { crowned: "Already crowned in your Kingdom", visited: "Already visited", listed: "Already Next in Line" };

// "Report" under a decree. Signed-in members only: the report goes to the
// owner's Feedback list in Admin, with a link back to this decree.
function ReportDecree({ crown, slug, viewer }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  if (viewer === undefined) return null;
  const linkStyle = { color: C.muted };
  if (!viewer) {
    return <Link href="/#sign-in" className="mt-2 inline-block text-xs underline" style={linkStyle}>Sign in to report</Link>;
  }
  if (sent) return <p className="mt-2 text-xs" style={{ color: C.green }}>Thanks, we&apos;ll take a look.</p>;
  if (!open) {
    return <button type="button" onClick={() => setOpen(true)} className="mt-2 block text-xs underline" style={linkStyle}>Report</button>;
  }
  const send = async () => {
    if (busy) return;
    setBusy(true); setErr("");
    try {
      await submitFeedback(viewer.id, formatDecreeReport({ slug, username: crown.username, throneId: crown.id, reason }), `r/${slug}`);
      setSent(true);
    } catch {
      setErr("Couldn't send that - try again in a moment.");
    }
    setBusy(false);
  };
  return (
    <div className="mt-2">
      <textarea
        aria-label="What's wrong with this decree? (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={1000}
        rows={2}
        placeholder="What's wrong with this decree? (optional)"
        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
      />
      {err && <p className="mt-1 text-xs" style={{ color: C.coup }}>{err}</p>}
      <div className="mt-1.5 flex items-center gap-3">
        <button type="button" onClick={send} disabled={busy} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.gold, color: C.onGold }}>
          {busy && <Loader2 size={12} className="animate-spin" />} Send report
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs underline" style={linkStyle}>Cancel</button>
      </div>
    </div>
  );
}

// The visible half of a restaurant page - see page.js for how the data is
// fetched and who it includes. Members' names and rank badges only, no
// profile photos, matching how shared links preview.
export default function RestaurantPageClient({ page }) {
  const { theme, toggleTheme } = useTheme();
  const [viewer, setViewer] = useState(undefined); // undefined = still checking
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [addErr, setAddErr] = useState("");

  useEffect(() => {
    getUser().then((u) => setViewer(u || null)).catch(() => setViewer(null));
  }, []);

  const cuisines = crownedCuisines(page.crowns);
  const rank = bestRankLabel(page);
  const where = [page.neighbourhood, page.city].filter(Boolean).join(" · ");
  // A few members' photos up top (four fit across a phone screen).
  const photos = page.crowns.flatMap((c) => c.photos || []).slice(0, 4);

  const addToList = async () => {
    if (!viewer || adding || added) return;
    setAdding(true); setAddErr("");
    try {
      const already = await savedPlaceStatus(viewer.id, page.google_place_id);
      if (already) {
        setAddErr(ALREADY[already]);
        setAdding(false);
        return;
      }
      // Filed under the cuisine it's most crowned for (not Overall Favourite).
      const cuisine = cuisines.find((c) => c.name !== "Overall Favourite");
      await addToNextInLine(viewer.id, {
        name: page.name, area: page.neighbourhood || "", address: page.address || "", city: page.city || null,
        googlePlaceId: page.google_place_id, cuisineId: cuisine?.id || null, mapsUrl: googleMapsUrl(page),
      });
      setAdded(true);
    } catch (e) {
      setAddErr(e.message || "Couldn't add it - try again.");
    }
    setAdding(false);
  };

  return (
    <FontShell>
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark size={26} />
          <span className="text-lg tracking-[0.1em]" style={{ ...display, fontWeight: 900 }}>NOMARCHY</span>
        </Link>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}
          >
            {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          <Link href={viewer ? "/" : "/#sign-in"} className="rounded-full px-4 py-2 text-xs font-bold sm:text-sm" style={{ background: C.gold, color: C.onGold }}>Open the app</Link>
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-5 pb-12">
        {page.closed && (
          <div className="mb-4 rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: C.coup + "1A", border: `1px solid ${C.coup}66`, color: C.coup }}>
            This restaurant has permanently closed.
          </div>
        )}

        <header>
          <h1 className="flex items-start gap-2 text-3xl leading-tight" style={{ ...display, fontWeight: 800 }}>
            <Crown size={24} className="mt-1.5 shrink-0" style={{ color: C.goldText }} fill={page.crown_count > 0 ? C.gold : "none"} strokeWidth={page.crown_count > 0 ? 0 : 2} />
            <span>{page.name}</span>
          </h1>
          {where && (
            <p className="mt-1 flex items-center gap-1 text-sm" style={{ color: C.muted }}><MapPin size={13} /> {where}</p>
          )}
          {cuisines.length > 0 && (
            <p className="mt-1 text-sm" style={{ color: C.cream }}>
              Crowned for{" "}
              {cuisines.map((c, i) => (
                <span key={c.name}>
                  {i > 0 && " · "}
                  <span aria-hidden="true">{c.emoji || getCuisineEmoji(c.name)}</span> <strong>{c.name}</strong>
                </span>
              ))}
            </p>
          )}
          <a href={googleMapsUrl(page)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" style={{ border: `1px solid ${C.cardEdge}`, color: C.goldText, background: C.card }}>
            Open in Google Maps <ExternalLink size={12} />
          </a>
        </header>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            [page.crown_count, page.crown_count === 1 ? "crown" : "crowns"],
            [page.want_count, "want to try"],
            [page.been_count, "been"],
          ].map(([n, label]) => (
            <div key={label} className="rounded-xl p-3 text-center" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
              <div className="text-2xl" style={{ ...display, fontWeight: 800, color: C.goldText }}>{n ?? 0}</div>
              <div className="text-xs" style={{ color: C.muted }}>{label}</div>
            </div>
          ))}
        </div>

        {rank && (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold" style={{ color: C.goldText }}>
            <Trophy size={15} /> {rank}
          </p>
        )}

        {photos.length > 0 && <div className="mt-4"><PhotoStrip photos={photos} /></div>}

        <h2 className="mb-2 mt-8 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.14em" }}>
          {page.crown_count > 0 ? "Why it holds the throne" : "Not crowned yet"}
        </h2>
        {page.crowns.length === 0 ? (
          <p className="rounded-xl p-4 text-sm" style={{ background: C.card, border: `1px dashed ${C.cardEdge}`, color: C.muted }}>
            No one has crowned this yet - be the first.
          </p>
        ) : page.crowns.map((c) => {
          const name = c.display_name || (c.username ? `@${c.username}` : "Someone");
          const href = kingdomPath(c.username);
          return (
            <article key={c.id} className="mb-3 rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
                {href ? <Link href={href} className="font-bold" style={{ color: C.cream }}>{name}</Link> : <span className="font-bold">{name}</span>}
                <RankBadge score={c.score} size={13} />
                {c.is_owner && <OwnerBadge size={13} />}
                <span className="text-xs" style={{ color: C.muted }}>
                  crowned it {c.cuisine === "Overall Favourite" ? "their Overall Favourite" : `for ${c.cuisine}`} · {fmt(c.crowned_at)}
                </span>
              </div>
              {c.decree && <p className="mt-2 text-sm leading-relaxed" style={{ color: C.cream + "E6" }}>&ldquo;{c.decree}&rdquo;</p>}
              <PhotoStrip photos={c.photos} />
              {c.endorsements > 0 && (
                <p className="mt-2 flex items-center gap-1 text-xs font-semibold" style={{ color: C.goldText }}>
                  <Crown size={11} /> {c.endorsements} {c.endorsements === 1 ? "endorsement" : "endorsements"}
                </p>
              )}
              <ReportDecree crown={c} slug={page.slug} viewer={viewer} />
            </article>
          );
        })}

        {viewer !== undefined && !page.closed && (
          <div className="mt-6 rounded-xl p-4 text-center" style={{ background: C.gold + "1A", border: `1px solid ${C.gold}` }}>
            {viewer ? (
              <>
                <button
                  onClick={addToList}
                  disabled={adding || added}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold"
                  style={added ? { background: C.green + "22", color: C.green, border: `1px solid ${C.green}66` } : { background: C.gold, color: C.onGold }}
                >
                  {adding ? <Loader2 size={14} className="animate-spin" /> : added ? <Check size={14} /> : <Bookmark size={14} />}
                  {added ? "Added to your Next in Line" : "Add to my Next in Line"}
                </button>
                {addErr && <p className="mt-2 text-xs" style={{ color: C.coup }}>{addErr}</p>}
              </>
            ) : (
              <>
                <p className="text-sm" style={{ color: C.cream }}>
                  <strong>Crown your own favourites.</strong> One restaurant per cuisine, and see what your friends swear by.
                </p>
                <Link href="/#sign-in" className="mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold" style={{ background: C.gold, color: C.onGold }}>
                  <Crown size={14} /> Join Nomarchy
                </Link>
              </>
            )}
          </div>
        )}

        <p className="mt-10 text-center text-xs" style={{ color: C.muted }}>
          Crowns from public kingdoms on Nomarchy. Place details from Google Maps.
          <br />
          <Link href="/faq" style={{ color: C.goldText }}>How Nomarchy works</Link>
          {" · "}
          <Link href="/privacy" style={{ color: C.goldText }}>Privacy Policy</Link>
        </p>
      </main>
    </FontShell>
  );
}
