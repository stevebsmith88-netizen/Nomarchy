// ============================================================
// Renders a shareable branded image for a crowned pick - a "receipt" card
// someone can post to their own story or send in a group chat, instead of
// the plain-text share that was here before.
//
// No custom font is bundled (ImageResponse/Satori needs real font binary
// data, not a Google Fonts stylesheet link, and the app doesn't ship any
// local font files - see app/theme.js) - it falls back to the default
// sans Satori ships with. Still carries the brand colors and crown mark,
// which is what actually reads as "Nomarchy" in a screenshot.
// ============================================================

import { ImageResponse } from "next/og";

export const runtime = "nodejs";

const C = {
  bg: "#1C1326", card: "#2A1D38", cardEdge: "#41305A",
  gold: "#E3B341", cream: "#F4ECDD", muted: "#A795BD",
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const cuisine = (searchParams.get("cuisine") || "").slice(0, 60);
  const name = (searchParams.get("name") || "").slice(0, 80);
  const area = (searchParams.get("area") || "").slice(0, 60);
  const rating = searchParams.get("rating") || "";
  const decree = (searchParams.get("decree") || "").slice(0, 220);
  const username = (searchParams.get("username") || "").slice(0, 40);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: C.bg,
          padding: "72px 64px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width={40} height={46} viewBox="0 -8 100 116" fill="none" stroke={C.gold} strokeWidth={7}>
            <circle cx={50} cy={-2} r={5} fill={C.gold} stroke="none" />
            <path d="M6 100V30L28 72L50 10L72 72L94 30V100Z" />
          </svg>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 900, color: C.cream, letterSpacing: 4 }}>NOMARCHY</div>
        </div>

        <div style={{ display: "flex", marginTop: 56, fontSize: 26, fontWeight: 700, color: C.gold, letterSpacing: 3, textTransform: "uppercase" }}>
          {cuisine}
        </div>
        <div style={{ display: "flex", marginTop: 16, fontSize: 68, fontWeight: 800, color: C.cream, lineHeight: 1.1 }}>
          {name}
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 28, color: C.muted, gap: 14, alignItems: "center" }}>
          {area && <div style={{ display: "flex" }}>{area}</div>}
          {rating && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: C.gold }}>
              <svg width={22} height={22} viewBox="0 0 24 24" fill={C.gold}>
                <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7-6.2-3.8L5.8 21l1.6-7L2 9.2l7.1-.6z" />
              </svg>
              {rating}
            </div>
          )}
        </div>

        {decree && (
          <div style={{ display: "flex", marginTop: 44, fontSize: 32, color: C.cream, lineHeight: 1.5, opacity: 0.9 }}>
            &ldquo;{decree}&rdquo;
          </div>
        )}

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `2px solid ${C.cardEdge}`, paddingTop: 28 }}>
          <div style={{ display: "flex", fontSize: 26, color: C.muted }}>{username ? `crowned by @${username}` : "crowned on Nomarchy"}</div>
          <div style={{ display: "flex", fontSize: 26, color: C.gold, fontWeight: 700 }}>nomarchy.ca</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  );
}
