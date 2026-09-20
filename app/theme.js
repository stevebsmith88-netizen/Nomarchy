// Shared visual identity - colors, fonts, the logo mark, and the page shell
// that loads them. Used by both the main app (app/page.js) and the public
// profile page (app/[username]/page.js) so a signed-out visitor's kingdom
// view looks identical to the owner's, with no duplicated palette to drift.

export const C = {
  bg: "#1C1326", card: "#2A1D38", cardEdge: "#41305A",
  gold: "#E3B341", cream: "#F4ECDD", muted: "#A795BD",
  coup: "#E85D4A", green: "#7FB069",
};
export const display = { fontFamily: "'Fraunces', serif" };
export const body = { fontFamily: "'Archivo', sans-serif" };

export const RANKS = [
  { min: 0, title: "Peckish Peasant", note: "Everyone starts hungry." },
  { min: 40, title: "Court Taster", note: "Your palate is earning trust." },
  { min: 100, title: "Noble of Nibbles", note: "People are starting to listen." },
  { min: 180, title: "Duke of Dinner", note: "Your word carries weight at the table." },
  { min: 280, title: "Monarch of Taste", note: "Long may you reign." },
];

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
