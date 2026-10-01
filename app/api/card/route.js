// ============================================================
// Renders a shareable branded image for a pick - a "receipt" card someone
// can post to their own story or send in a group chat, instead of the
// plain-text share that was here before. Used for both a crowned throne
// (status=crowned, the default) and a Next in Line pick shared to ask
// friends what they think (status=considering) - same card, just a
// different footer line and no "quoted decree" framing for one that
// hasn't been crowned yet.
//
// Sized for Instagram Stories (1080x1920, 9:16) rather than a square
// post - that's the share people actually reach for in a group chat or
// their own story, and a square image just gets letterboxed there anyway.
// The main content is vertically centered with the footer pinned to the
// bottom, rather than top-anchored like the old square card, so the
// extra height reads as an intentional story layout, not empty space
// under a small square.
//
// No custom font is bundled (ImageResponse/Satori needs real font binary
// data, not a Google Fonts stylesheet link, and the app doesn't ship any
// local font files - see app/theme.js) - it falls back to the default
// sans Satori ships with. Still carries the brand colors and crown mark,
// which is what actually reads as "Nomarchy" in a screenshot.
// ============================================================

import { ImageResponse } from "next/og";
import QRCode from "qrcode";

export const runtime = "nodejs";

const C = {
  bg: "#1D1326", card: "#2A1E38", cardEdge: "#41305A",
  gold: "#E2B340", cream: "#F5ECDE", muted: "#A795BD",
};

// A card with no way back to the app was just a nice-looking image - this
// is what actually turns a share into a visit. Rendered as a plain grid
// of SVG rects from the raw module matrix (QRCode.create is synchronous
// and dependency-free, no canvas/DOM needed) rather than an <img>, since
// Satori's Node renderer can't reliably fetch an external image mid-render.
// Light modules on dark would look more on-brand, but real light-on-dark
// QR codes scan noticeably worse in practice - correctness over branding
// here, so it's a plain white square regardless of light/dark app theme.
function QrCode({ text, size = 220 }) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const count = qr.modules.size;
  const quiet = 2;
  const moduleSize = size / (count + quiet * 2);
  const rects = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.modules.get(row, col)) {
        rects.push(
          <rect
            key={`${row}-${col}`}
            x={(col + quiet) * moduleSize}
            y={(row + quiet) * moduleSize}
            width={moduleSize}
            height={moduleSize}
            fill="#1D1326"
          />
        );
      }
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ borderRadius: 12 }}>
      <rect x={0} y={0} width={size} height={size} fill="#FFFFFF" />
      {rects}
    </svg>
  );
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const cuisine = (searchParams.get("cuisine") || "").slice(0, 60);
  const name = (searchParams.get("name") || "").slice(0, 80);
  const area = (searchParams.get("area") || "").slice(0, 60);
  const rating = searchParams.get("rating") || "";
  const blurb = (searchParams.get("blurb") || "").slice(0, 220);
  const username = (searchParams.get("username") || "").slice(0, 40);
  const status = searchParams.get("status") || "crowned";
  const considering = status === "considering";
  // A rank promotion isn't about a restaurant at all - same card shell
  // (header, QR, footer) but the middle swaps a place name for a title,
  // and the blurb is the rank's proclamation rather than a decree.
  const promoted = status === "promoted";
  const rank = (searchParams.get("rank") || "").slice(0, 60);
  // A username lands the scanner on real social proof (this person's
  // actual kingdom) before ever asking them to sign up - a bare homepage
  // would be a colder landing for someone who's never seen the app.
  const linkUrl = username ? `https://nomarchy.ca/${username}` : "https://nomarchy.ca";

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
        <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <svg width={40} height={46} viewBox="0 -8 100 116" fill="none" stroke={C.gold} strokeWidth={7}>
              <circle cx={50} cy={-2} r={5} fill={C.gold} stroke="none" />
              <path d="M6 100V30L28 72L50 10L72 72L94 30V100Z" />
            </svg>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 900, color: C.cream, letterSpacing: 4 }}>NOMARCHY</div>
          </div>

          {promoted ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ display: "flex", marginTop: 56, fontSize: 26, fontWeight: 700, color: C.muted, letterSpacing: 3, textTransform: "uppercase" }}>
                Promoted to
              </div>
              <div style={{ display: "flex", marginTop: 16, fontSize: 60, fontWeight: 800, color: C.gold, lineHeight: 1.15, textAlign: "center" }}>
                {rank}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              {considering && (
                <div style={{ display: "flex", marginTop: 56, fontSize: 26, fontWeight: 700, color: C.muted, letterSpacing: 3, textTransform: "uppercase" }}>
                  Worth a visit?
                </div>
              )}
              <div style={{ display: "flex", marginTop: considering ? 16 : 56, fontSize: 26, fontWeight: 700, color: C.gold, letterSpacing: 3, textTransform: "uppercase" }}>
                {cuisine}
              </div>
              <div style={{ display: "flex", marginTop: 16, fontSize: 68, fontWeight: 800, color: C.cream, lineHeight: 1.1, textAlign: "center" }}>
                {name}
              </div>
              <div style={{ display: "flex", marginTop: 18, fontSize: 28, color: C.muted, gap: 14, alignItems: "center", justifyContent: "center" }}>
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
            </div>
          )}

          {blurb && (
            <div style={{ display: "flex", marginTop: 44, fontSize: 32, color: C.cream, lineHeight: 1.5, opacity: 0.9, textAlign: "center", maxWidth: 850 }}>
              &ldquo;{blurb}&rdquo;
            </div>
          )}

          <div style={{ display: "flex", marginTop: 64 }}>
            <QrCode text={linkUrl} />
          </div>
          <div style={{ display: "flex", marginTop: 14, fontSize: 22, color: C.muted, letterSpacing: 1 }}>
            {username ? `Scan for @${username}'s kingdom` : "Scan to open Nomarchy"}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, borderTop: `2px solid ${C.cardEdge}`, paddingTop: 28 }}>
          <div style={{ display: "flex", fontSize: 26, color: C.muted }}>
            {promoted
              ? (username ? `@${username}'s new rank` : "promoted on Nomarchy")
              : username
                ? `${considering ? "on" : "crowned by"} @${username}${considering ? "'s list" : ""}`
                : considering ? "on the list" : "crowned on Nomarchy"}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: C.gold, fontWeight: 700 }}>nomarchy.ca</div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920 }
  );
}
