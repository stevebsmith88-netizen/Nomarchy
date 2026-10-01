"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { C } from "./theme";
import { cuisinePinIcon, PIN_GOLD, PIN_BLUE } from "./cuisineIcons";

// Two ring colours, two meanings: gold matches "crowned/favourite"
// everywhere else in the app, so it's reused here for anything already
// been to (crowned or just visited); blue for anything still on the list
// to try. The emoji inside each pin is purely "what cuisine" - the ring
// is what still carries been/want, so the two never collide on one pin.

export default function NextInLineMap({ beenPins, wantPins }) {
  const allPins = [...beenPins, ...wantPins];
  if (allPins.length === 0) {
    return (
      <p className="rounded-xl p-6 text-center text-sm" style={{ background: C.card, border: `1px dashed ${C.cardEdge}`, color: C.muted }}>
        Nothing with a location yet - this fills in automatically as you crown places or add to Next in Line,
        or once older entries are backfilled.
      </p>
    );
  }

  const center = [allPins[0].lat, allPins[0].lng];

  return (
    <div>
      <div style={{ height: 420, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.cardEdge}` }}>
        <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {beenPins.map((p, i) => (
            <Marker key={`been-${i}`} position={[p.lat, p.lng]} icon={cuisinePinIcon(p.cuisine, PIN_GOLD)}>
              <Popup><strong>{p.name}</strong><br />{p.cuisine}<br />Been</Popup>
            </Marker>
          ))}
          {wantPins.map((p, i) => (
            <Marker key={`want-${i}`} position={[p.lat, p.lng]} icon={cuisinePinIcon(p.cuisine, PIN_BLUE)}>
              <Popup><strong>{p.name}</strong><br />{p.cuisine}<br />Still to try</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
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
