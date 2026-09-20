// Shared visual identity - colors, fonts, the logo mark, and the page shell
// that loads them. Used by both the main app (app/page.js) and the public
// profile page (app/[username]/page.js) so a signed-out visitor's kingdom
// view looks identical to the owner's, with no duplicated palette to drift.

import { Crown, Sparkles } from "lucide-react";

export const C = {
  bg: "#1C1326", card: "#2A1D38", cardEdge: "#41305A",
  gold: "#E3B341", cream: "#F4ECDD", muted: "#A795BD",
  coup: "#E85D4A", green: "#7FB069",
};
export const display = { fontFamily: "'Fraunces', serif" };
export const body = { fontFamily: "'Archivo', sans-serif" };

// The gap to the next tier widens as you climb - the first promotion is
// quick (you just need to try the app), the last one is a real reign.
export const RANKS = [
  { min: 0, title: "Peckish Peasant", note: "Everyone starts hungry." },
  { min: 30, title: "Court Taster", note: "Your palate is earning trust." },
  { min: 70, title: "Kitchen Knight", note: "You've earned your spurs at the table." },
  { min: 120, title: "Baron of the Bites", note: "A modest but real domain of taste." },
  { min: 180, title: "Viscount of Victuals", note: "Your picks are getting harder to ignore." },
  { min: 250, title: "Earl of Eats", note: "A serious reputation at the table." },
  { min: 330, title: "Duke of Dinner", note: "Your word carries weight at the table." },
  { min: 420, title: "Prince/Princess of the Palate", note: "One reign away from the throne." },
  { min: 520, title: "Monarch of Taste", note: "Long may you reign." },
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
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet" />
      {children}
    </div>
  );
}
