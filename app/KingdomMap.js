"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { C } from "./theme";

// Leaflet's default marker icon references image files by a relative
// path that doesn't resolve through Next's bundler - pointing it at the
// same package's own files on a CDN is the standard workaround, and this
// app's CSP already allows any https image source.
const icon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

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
          <Marker key={i} position={[p.lat, p.lng]} icon={icon}>
            <Popup>
              <strong>{p.name}</strong><br />{p.cuisine}{p.friend ? <> &middot; crowned by {p.friend}</> : null}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
