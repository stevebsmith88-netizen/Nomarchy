"use client";

import { C } from "./theme";
import { PIN_GOLD, PIN_BLUE, getCuisineEmoji } from "./cuisineIcons";
import PinMap from "./PinMap";

// Two ring colours, two meanings: gold matches "crowned/favourite"
// everywhere else in the app, so it's reused here for anything already
// been to (crowned or just visited); blue for anything still on the list
// to try. The emoji inside each pin is purely "what cuisine" - the ring
// is what still carries been/want, so the two never collide on one pin.
export default function NextInLineMap({ beenPins, wantPins }) {
  if (beenPins.length + wantPins.length === 0) {
    return (
      <p className="rounded-xl p-6 text-center text-sm" style={{ background: C.card, border: `1px dashed ${C.cardEdge}`, color: C.muted }}>
        Nothing with a location yet - this fills in automatically as you crown places or add to Next in Line,
        or once older entries are backfilled.
      </p>
    );
  }

  const pins = [
    ...beenPins.map((p) => ({ lat: p.lat, lng: p.lng, name: p.name, cuisine: p.cuisine, emoji: getCuisineEmoji(p.cuisine), ring: PIN_GOLD, details: [p.cuisine, "Been"] })),
    ...wantPins.map((p) => ({ lat: p.lat, lng: p.lng, name: p.name, cuisine: p.cuisine, emoji: getCuisineEmoji(p.cuisine), ring: PIN_BLUE, details: [p.cuisine, "Still to try"] })),
  ];

  return (
    <div>
      <PinMap pins={pins} />
      <div className="mt-2 flex items-center gap-4 text-xs" style={{ color: C.muted }}>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIN_GOLD }} /> Been
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: PIN_BLUE }} /> Still to try
        </span>
      </div>
    </div>
  );
}
