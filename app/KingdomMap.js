"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { C } from "./theme";
import { cuisinePinIcon, PIN_GOLD } from "./cuisineIcons";

export default function KingdomMap({ pins, emptyMessage }) {
  if (pins.length === 0) {
    return (
      <p className="rounded-xl p-6 text-center text-sm" style={{ background: C.card, border: `1px dashed ${C.cardEdge}`, color: C.muted }}>
        {emptyMessage || "None of your crowned spots have a location yet - this fills in automatically as you crown new places, or once older ones are backfilled."}
      </p>
    );
  }

  const center = [pins[0].lat, pins[0].lng];

  return (
    <div style={{ height: 420, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.cardEdge}` }}>
      <MapContainer center={center} zoom={12} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pins.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lng]} icon={cuisinePinIcon(p.cuisine, PIN_GOLD)}>
            <Popup>
              <strong>{p.name}</strong><br />{p.cuisine}{p.friend ? <> &middot; crowned by {p.friend}</> : null}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
