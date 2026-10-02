"use client";

import { C } from "./theme";
import { PIN_GOLD, getCuisineEmoji } from "./cuisineIcons";
import PinMap from "./PinMap";

export default function KingdomMap({ pins, emptyMessage }) {
  if (pins.length === 0) {
    return (
      <p className="rounded-xl p-6 text-center text-sm" style={{ background: C.card, border: `1px dashed ${C.cardEdge}`, color: C.muted }}>
        {emptyMessage || "None of your crowned spots have a location yet - this fills in automatically as you crown new places, or once older ones are backfilled."}
      </p>
    );
  }

  return (
    <PinMap
      pins={pins.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        name: p.name,
        cuisine: p.cuisine,
        emoji: getCuisineEmoji(p.cuisine),
        ring: PIN_GOLD,
        details: [p.friend ? `${p.cuisine} · crowned by ${p.friend}` : p.cuisine],
      }))}
    />
  );
}
