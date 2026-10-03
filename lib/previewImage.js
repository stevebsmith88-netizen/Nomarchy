// The picture that shows when a Nomarchy link is shared (iMessage, WhatsApp,
// Instagram, Slack...): the split-circle look of the Instagram icon across
// the top of a wide card - purple on the left, beige on the right, with the
// crown crossing the seam and swapping colours - and a plain beige area
// below it for the name. 1200x630, the size those apps expect.

import { ImageResponse } from "next/og";

export const PREVIEW_SIZE = { width: 1200, height: 630 };

const PURPLE = "#1D1326";
const BEIGE = "#F5ECDE";
const SIDES = {
  // [background, crown, main text, quieter text]
  left: { bg: PURPLE, crown: "#E2B340", text: BEIGE, soft: "#B9A9CC" },
  right: { bg: BEIGE, crown: "#A8812A", text: PURPLE, soft: "#6B5C7D" },
};

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// The top of the card: the crown on the purple/beige split. A full-width
// copy in one side's colours, so the crown can run across the seam.
function CrownLayer({ side, height }) {
  const c = SIDES[side];
  return (
    <div style={{ width: PREVIEW_SIZE.width, height, display: "flex", alignItems: "center", justifyContent: "center", background: c.bg }}>
      <svg width={190} height={220} viewBox="0 -8 100 116" fill="none" stroke={c.crown} strokeWidth={6} strokeLinecap="round">
        <circle cx={50} cy={-2} r={4} fill={c.crown} stroke="none" />
        <path d="M6 100V30L28 72L50 10L72 72L94 30V100Z" />
        <path d="M50 100V72M43 56v10a7 7 0 0 0 14 0V56M50 56v12" strokeWidth={4} />
      </svg>
    </div>
  );
}

// The crown area is the top 58%; the name area below is plain beige.
const CROWN_HEIGHT = 366;

// title: the big line (a restaurant's name, "NOMARCHY"); subtitle: the small one.
export function previewImage({ title = "NOMARCHY", subtitle = "Long live your favourites" } = {}) {
  const t = clip(String(title).toUpperCase(), 34);
  const s = clip(String(subtitle), 60);
  const titleSize = t.length > 24 ? 46 : t.length > 16 ? 60 : 76;
  const { width, height } = PREVIEW_SIZE;
  const half = width / 2;
  const right = SIDES.right;
  return new ImageResponse(
    (
      <div style={{ width, height, display: "flex", flexDirection: "column", background: right.bg, fontFamily: "sans-serif" }}>
        <div style={{ width, height: CROWN_HEIGHT, display: "flex", position: "relative" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: half, height: CROWN_HEIGHT, display: "flex", overflow: "hidden" }}>
            <CrownLayer side="left" height={CROWN_HEIGHT} />
          </div>
          <div style={{ position: "absolute", left: half, top: 0, width: half, height: CROWN_HEIGHT, display: "flex", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: -half, top: 0, display: "flex" }}>
              <CrownLayer side="right" height={CROWN_HEIGHT} />
            </div>
          </div>
        </div>
        <div style={{ width, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingBottom: 10 }}>
          <div style={{ display: "flex", fontSize: titleSize, fontWeight: 800, letterSpacing: 6, color: right.text }}>{t}</div>
          <div style={{ display: "flex", marginTop: 16, fontSize: 32, letterSpacing: 3, color: right.soft }}>{s}</div>
        </div>
      </div>
    ),
    { ...PREVIEW_SIZE }
  );
}
