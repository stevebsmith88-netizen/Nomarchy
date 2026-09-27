"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { C } from "./theme";

// Two colours, two meanings: gold matches "crowned/favourite" everywhere
// else in the app, so it's reused here for anything already been to
// (crowned or just visited). Blue reuses Leaflet's own default marker -
// the same icon the Kingdom map already shows - for anything still on
// the list to try, so it isn't a brand-new visual element to learn.
const wantIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
const beenIcon = L.icon({
  iconUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-gold.png",
  iconRetinaUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-icon-2x-gold.png",
  shadowUrl: "https://cdn.jsdelivr.net/gh/pointhi/leaflet-color-markers@master/img/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

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
            <Marker key={`been-${i}`} position={[p.lat, p.lng]} icon={beenIcon}>
              <Popup><strong>{p.name}</strong><br />{p.cuisine}<br />Been</Popup>
            </Marker>
          ))}
          {wantPins.map((p, i) => (
            <Marker key={`want-${i}`} position={[p.lat, p.lng]} icon={wantIcon}>
              <Popup><strong>{p.name}</strong><br />{p.cuisine}<br />Still to try</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs" style={{ color: C.muted }}>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: C.gold }} /> Been
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#4A80C7" }} /> Still to try
        </span>
      </div>
    </div>
  );
}
