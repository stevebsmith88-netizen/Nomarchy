// The picture that shows when a Nomarchy link is shared (iMessage, WhatsApp,
// Instagram, Slack...): the round split logo (the Instagram icon) centred on
// plain beige, with the name beneath. 1200x630, the size those apps expect.

import { ImageResponse } from "next/og";
import { LOGO_CIRCLE } from "./logoCircle";

export const PREVIEW_SIZE = { width: 1200, height: 630 };

const BEIGE = "#F5ECDE";
const PURPLE = "#1D1326";
const SOFT = "#6B5C7D";

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// title: the big line (a restaurant's name, "NOMARCHY"); subtitle: the small one.
export function previewImage({ title = "NOMARCHY", subtitle = "Long live your favourites" } = {}) {
  const t = clip(String(title).toUpperCase(), 34);
  const s = clip(String(subtitle), 60);
  const titleSize = t.length > 24 ? 46 : t.length > 16 ? 60 : 76;
  const { width, height } = PREVIEW_SIZE;
  return new ImageResponse(
    (
      <div style={{ width, height, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: BEIGE, fontFamily: "sans-serif" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_CIRCLE} width={290} height={290} alt="" />
        <div style={{ display: "flex", marginTop: 30, fontSize: titleSize, fontWeight: 800, letterSpacing: 6, color: PURPLE }}>{t}</div>
        <div style={{ display: "flex", marginTop: 14, fontSize: 32, letterSpacing: 3, color: SOFT }}>{s}</div>
      </div>
    ),
    { ...PREVIEW_SIZE }
  );
}
