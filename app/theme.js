// Shared visual identity - colors, fonts, the logo mark, and the page shell
// that loads them. Used by both the main app (app/page.js) and the public
// profile page (app/[username]/page.js) so a signed-out visitor's kingdom
// view looks identical to the owner's, with no duplicated palette to drift.

"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { Crown, Sparkles } from "lucide-react";

// gold = fills, crowns, borders and icons; goldText = gold used for words
// (links, labels, badges); onGold = text sitting on a gold fill (buttons).
// In dark mode they're all the same bright gold on dark plum.
const DARK = {
  bg: "#1D1326", card: "#2A1E38", cardEdge: "#41305A",
  gold: "#E2B340", goldText: "#E2B340", onGold: "#1D1326", onCoup: "#1D1326", cream: "#F5ECDE", muted: "#A795BD",
  coup: "#E85D4A", green: "#7FB069",
};

// Same brand hues, re-tuned for a light background rather than a dark one -
// the dark-mode gold and muted purple are both light, warm-ish tones
// themselves, so reused as text straight against a cream page they'd have
// almost no contrast. "cream" keeps its key name (every component already
// reads C.cream as "primary text colour") even though it's now the dark
// text tone, not literally cream - the role stays the same, the hex
// underneath just serves whichever theme is active.
//
// Gold, red and green are deeper here than in dark mode so text in them
// meets the WCAG AA contrast ratio (4.5:1) on both the page and on cards -
// including on their own pale tint, which badges sit on.
const LIGHT = {
  bg: "#F5ECDE", card: "#FFFFFF", cardEdge: "#E4D6BE",
  gold: "#775912", goldText: "#775912", onGold: "#F5ECDE", onCoup: "#FFFFFF", cream: "#2A1E38", muted: "#6B5C7D",
  coup: "#A8352A", green: "#3D6A2E",
};

// A real object, not a lookup - every existing `C.gold`/`C.bg`/etc. call
// site across the app (there are hundreds) keeps working completely
// unchanged. Switching themes mutates THIS object's properties in place
// rather than swapping in a new one, so every file's existing static
// `import { C } from "./theme"` still points at live, current values -
// no per-component rewiring needed, just something that re-renders each
// page's own tree after the mutation so those values get re-read.
//
// Light is the default for anyone who has never picked a mode (the landing
// page reads best that way); a saved choice of dark is restored on load.
export const C = { ...LIGHT };

const STORAGE_KEY = "nomarchy-theme";

const ThemeContext = createContext({ theme: "light", toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState("light");
  // True once the saved choice (if any) has been applied - until then the
  // page may be deliberately hidden (see the inline script in layout.js),
  // so nothing reveals it early.
  const [restored, setRestored] = useState(false);

  // Runs once, after the default (light) render. Someone who chose dark
  // last time would otherwise see a flash of light first, so layout.js's
  // inline script hides the page and paints the dark background until this
  // has applied their choice and the next render has committed.
  useEffect(() => {
    let saved;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch { saved = null; }
    if (saved === "dark") {
      Object.assign(C, DARK);
      setTheme("dark");
    }
    setRestored(true);
  }, []);

  // Keeps the parts outside React's tree in step with the theme: the
  // page-edge background (what shows on overscroll), the phone's browser
  // bar colour, and un-hiding the page once the right theme is on screen.
  useEffect(() => {
    if (!restored) return;
    const root = document.documentElement;
    root.style.setProperty("--page-bg", C.bg);
    root.style.setProperty("--focus-ring", C.goldText);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", C.bg);
    root.removeAttribute("data-theme-pending");
  }, [theme, restored]);

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
// `proclamation` is the longer, over-the-top paragraph for the promotion
// celebration modal (see PromotionModal in app/page.js) - deliberately
// separate from the short `note` above, which stays as the quick inline
// description used elsewhere (profile badge, welcome email). Each one
// leans into what that specific title actually means historically
// (a knighting, a land grant, a coronation...) rather than being
// interchangeable congratulations - that's what makes the ladder itself
// feel like the joke, not just the fact of levelling up. No proclamation
// on Peckish Peasant - everyone starts there, nobody gets "promoted" into
// it, so it's never shown.
export const RANKS = [
  { min: 0, title: "Peckish Peasant", note: "Everyone starts hungry." },
  {
    min: 30, title: "Court Taster", note: "Your palate is earning trust.",
    proclamation: "By order of the Court, {name} has been appointed Royal Taster. Every dish that reaches the table must now pass your verdict first - the kitchen fears your palate, and rightly so.",
  },
  {
    min: 70, title: "Kitchen Knight", note: "You've earned your spurs at the table.",
    proclamation: "Hear ye! By unanimous decree of taste and timing, {name} has been knighted at the table. The realm has tasted your judgment and found it worthy - rise, Kitchen Knight, and may your next pick be even bolder.",
  },
  {
    min: 120, title: "Baron of the Bites", note: "A modest but real domain of taste.",
    proclamation: "Land, title, and a modest holding of flavour now belong to {name}. The deed is signed, the seal is wax, and your tenants (your friends) owe you nothing but their trust in where to eat next. Welcome to the peerage, Baron of the Bites.",
  },
  {
    min: 180, title: "Viscount of Victuals", note: "Your picks are getting harder to ignore.",
    proclamation: "The Crown has taken notice. {name} now governs a growing stretch of the realm's finest tables as Viscount of Victuals - a title too big to ignore and too tasty to argue with.",
  },
  {
    min: 270, title: "Earl of Eats", note: "A serious reputation at the table.",
    proclamation: "Few climb this high. {name} now holds one of the oldest and most respected seats at the table: Earl of Eats. Dukes consult you. Commoners quote you. The realm takes your word as law.",
  },
  {
    min: 400, title: "Duke of Dinner", note: "Your word carries weight at the table.",
    proclamation: "A vast domain of discerning taste now answers to {name}. As Duke of Dinner, your word carries the weight of an edict - argue with it at your own risk, and at your own expense.",
  },
  {
    min: 580, title: "Prince/Princess of the Palate", note: "One reign away from the throne.",
    proclamation: "The throne room doors have creaked open. {name} stands one reign away as Prince/Princess of the Palate - heir to the realm's highest honour, and the last to cross before the crown itself.",
  },
  {
    min: 820, title: "Monarch of Taste", note: "Long may you reign.",
    proclamation: "All hail {name}, Monarch of Taste! The crown is yours, the realm bows, and every throne in the kingdom now answers to a ruler who has earned every last bite of it. Long may you reign.",
  },
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
      style={{ color: C.goldText }}
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
