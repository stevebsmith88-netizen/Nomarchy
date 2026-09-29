// Shared visual identity - colors, fonts, the logo mark, and the page shell
// that loads them. Used by both the main app (app/page.js) and the public
// profile page (app/[username]/page.js) so a signed-out visitor's kingdom
// view looks identical to the owner's, with no duplicated palette to drift.

"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Crown, Sparkles } from "lucide-react";

const DARK = {
  bg: "#1D1326", card: "#2A1E38", cardEdge: "#41305A",
  gold: "#E2B340", cream: "#F5ECDE", muted: "#A795BD",
  coup: "#E85D4A", green: "#7FB069",
};

// Same brand hues, re-tuned for a light background rather than a dark one -
// the dark-mode gold and muted purple are both light, warm-ish tones
// themselves, so reused as text straight against a cream page they'd have
// almost no contrast. "cream" keeps its key name (every component already
// reads C.cream as "primary text colour") even though it's now the dark
// text tone, not literally cream - the role stays the same, the hex
// underneath just serves whichever theme is active.
const LIGHT = {
  bg: "#F5ECDE", card: "#FFFFFF", cardEdge: "#E4D6BE",
  gold: "#A67C1E", cream: "#2A1E38", muted: "#6B5C7D",
  coup: "#E85D4A", green: "#7FB069",
};

// A real object, not a lookup - every existing `C.gold`/`C.bg`/etc. call
// site across the app (there are hundreds) keeps working completely
// unchanged. Switching themes mutates THIS object's properties in place
// rather than swapping in a new one, so every file's existing static
// `import { C } from "./theme"` still points at live, current values -
// no per-component rewiring needed, just something that re-renders each
// page's own tree after the mutation so those values get re-read.
export const C = { ...DARK };

const STORAGE_KEY = "nomarchy-theme";

const ThemeContext = createContext({ theme: "dark", toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("dark");

  // Runs once, after the page's own default-dark render - a user who
  // picked light on a previous visit sees a brief flash of dark before
  // this kicks in, a known, acceptable tradeoff for how much simpler this
  // keeps the setup (no blocking inline script in the document head).
  useEffect(() => {
    let saved;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch { saved = null; }
    if (saved === "light" || saved === "dark") {
      Object.assign(C, saved === "light" ? LIGHT : DARK);
      setTheme(saved);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    Object.assign(C, next === "light" ? LIGHT : DARK);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    setTheme(next);
  };

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

// Call this once near the top of each separately-rendered page (the main
// app, the public profile page, the FAQ/terms/privacy pages) - that one
// call is what makes that page's whole component tree re-render (and so
// re-read C's now-current values) when the theme changes. A component
// deeper in the tree that just reads C.xyz directly, with no hook call of
// its own, still updates for free as part of that cascading re-render.
export function useTheme() {
  return useContext(ThemeContext);
}
// Matches the real brand pairing: Raleway for the wordmark/headings, and
// Work Sans standing in for Proxima Nova (the logo's actual sub-font,
// which is a paid Adobe Fonts typeface, not available to load for free) -
// picked for reading cleanly at the small sizes used throughout decrees
// and notes, while still pairing well with Raleway's geometric headlines.
export const display = { fontFamily: "'Raleway', sans-serif" };
export const body = { fontFamily: "'Work Sans', sans-serif" };

// The gap to the next tier widens as you climb - the first promotion is
// quick (you just need to try the app), the last one is a real reign.
// Gaps between tiers were already increasing (+10 each step) but stayed
// linear all the way up - fine while score only came from crowns, coups,
// decrees and endorsements, but each new scoring input (photos now, quests
// later) makes the top of the ladder easier to reach without anyone
// actually playing "better." The bottom five tiers are untouched - early
// progress should stay quick, that's what hooks a new user - but Earl and
// up now grow much faster than linear, so the ceiling keeps meaning
// something as more ways to earn points get added underneath it.
export const RANKS = [
  { min: 0, title: "Peckish Peasant", note: "Everyone starts hungry." },
  { min: 30, title: "Court Taster", note: "Your palate is earning trust." },
  { min: 70, title: "Kitchen Knight", note: "You've earned your spurs at the table." },
  { min: 120, title: "Baron of the Bites", note: "A modest but real domain of taste." },
  { min: 180, title: "Viscount of Victuals", note: "Your picks are getting harder to ignore." },
  { min: 270, title: "Earl of Eats", note: "A serious reputation at the table." },
  { min: 400, title: "Duke of Dinner", note: "Your word carries weight at the table." },
  { min: 580, title: "Prince/Princess of the Palate", note: "One reign away from the throne." },
  { min: 820, title: "Monarch of Taste", note: "Long may you reign." },
];

export function getRank(score) {
  return [...RANKS].reverse().find((r) => score >= r.min) || RANKS[0];
}

// The owner doesn't climb the same ladder as everyone else - "Founding
// Monarch" is a fixed title, not a score threshold, and it deliberately
// isn't the same string as the top of RANKS ("Monarch of Taste") so that
// title stays something everyone else can still earn.
const OWNER_TITLE = "Founding Monarch";

export function getTitle(isOwner, score) {
  return isOwner ? OWNER_TITLE : getRank(score).title;
}

// Small Reddit-flair-style badge next to a name. The crown fills in and
// brightens tier by tier so the ladder is visible at a glance, not just
// readable in a tooltip.
export function RankBadge({ score, size = 14 }) {
  const tier = RANKS.indexOf(getRank(score));
  const lit = RANKS.length <= 1 ? 1 : tier / (RANKS.length - 1);
  const color = `color-mix(in srgb, ${C.muted} ${Math.round((1 - lit) * 70)}%, ${C.gold})`;
  return (
    <Crown
      size={size}
      style={{ color }}
      fill={tier >= RANKS.length - 1 ? color : "none"}
      strokeWidth={tier >= RANKS.length - 1 ? 0 : 2}
      title={`${getRank(score).title} (${score} pts)`}
    />
  );
}

// The app founder's badge - not earned by score, just who built the place.
export function OwnerBadge({ size = 14 }) {
  return (
    <Sparkles
      size={size}
      style={{ color: C.gold }}
      fill={C.gold}
      strokeWidth={0}
      title="Founder"
    />
  );
}

// The crown mark, drawn inline so it always matches C.gold exactly - no
// separate image asset to keep in sync with the button color.
export function LogoMark({ size = 32 }) {
  return (
    <svg
      viewBox="0 -8 100 116"
      width={size}
      height={size * (116 / 100)}
      fill="none"
      stroke={C.gold}
      strokeWidth={6}
      strokeLinecap="round"
    >
      <circle cx={50} cy={-2} r={4} fill={C.gold} stroke="none" />
      <path d="M6 100V30L28 72L50 10L72 72L94 30V100Z" />
      <path d="M50 100V72M43 56v10a7 7 0 0 0 14 0V56M50 56v12" strokeWidth={4} />
    </svg>
  );
}

export function FontShell({ children }) {
  return (
    <div className="min-h-screen w-full" style={{ background: C.bg, color: C.cream, ...body }}>
      <link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700;800;900&family=Work+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      {children}
    </div>
  );
}
