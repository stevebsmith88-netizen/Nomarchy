"use client";

import { useEffect, useRef, useState } from "react";
import { C, useTheme } from "./theme";
import { loadGoogleMaps, onMapsAuthFailure } from "../lib/googleMapsLoader";
import { cuisinePinElement } from "./cuisineIcons";
import { supabase } from "../lib/data";

// The one Google map behind Kingdom, Court and Next in Line. Each pin is
// { lat, lng, name, cuisine, ring, details: [lines for the popup] }.
//
// Two effects on purpose: the map itself is created once per light/dark
// theme (Google only accepts the colour scheme when a map is created, so a
// theme switch builds a fresh map), while pins are rebuilt whenever the list
// changes without touching the map - so filtering doesn't re-load it.
//
// All text that comes from people (restaurant names, friends' names) goes
// into the popup with textContent, never as HTML.

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID";
const FALLBACK_CENTER = { lat: 43.6532, lng: -79.3832 };

const MESSAGES = {
  "missing-key": "The map isn't set up on this site yet.",
  "script-blocked": "The map couldn't load. Check your connection and try again.",
  "auth": "Google didn't accept the map key for this site.",
};

// Fire-and-forget: tells the server a map was loaded, so Admin's Google
// usage table can count the one Google charge that grows with traffic.
async function countMapLoad() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetch("/api/usage/map-load", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}` } });
  } catch {}
}

function popupContent(pin) {
  const node = document.createElement("div");
  node.style.cssText = "font:14px/1.4 system-ui,-apple-system,sans-serif;color:#1D1326;max-width:220px;";
  const title = document.createElement("strong");
  title.textContent = pin.name;
  node.append(title);
  for (const line of pin.details || []) {
    const row = document.createElement("div");
    row.style.cssText = "color:#555;font-size:12px;margin-top:2px;";
    row.textContent = line;
    node.append(row);
  }
  return node;
}

export default function PinMap({ pins }) {
  const { theme } = useTheme();
  // The parent builds a fresh array on every render; only the content
  // matters, so pins are redrawn when this key changes, not on every render.
  const pinsKey = JSON.stringify(pins);
  const boxRef = useRef(null);
  const mapRef = useRef(null);
  const infoRef = useRef(null);
  const markersRef = useRef([]);
  const [status, setStatus] = useState("loading");
  const [problem, setProblem] = useState("");
  // The map object itself, not a status word, is what the pin effect watches:
  // after a theme switch a new map is built within the same React update as
  // the old one's teardown, and "ready" -> "loading" -> "ready" looks like no
  // change at all - the new map would come up with no pins.
  const [map, setMap] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const box = boxRef.current;
    // A theme change rebuilds the map, so it starts from "loading" again.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus("loading"); setProblem("");
    const stopAuth = onMapsAuthFailure(() => { if (!cancelled) { setProblem("auth"); setStatus("error"); } });
    (async () => {
      try {
        const google = await loadGoogleMaps();
        const { Map, InfoWindow } = await google.maps.importLibrary("maps");
        const { ColorScheme } = await google.maps.importLibrary("core");
        await google.maps.importLibrary("marker");
        if (cancelled || !boxRef.current) return;
        const created = new Map(boxRef.current, {
          mapId: MAP_ID,
          colorScheme: theme === "light" ? ColorScheme.LIGHT : ColorScheme.DARK,
          center: FALLBACK_CENTER,
          zoom: 11,
          disableDefaultUI: true,
          zoomControl: true,
        });
        mapRef.current = created;
        infoRef.current = new InfoWindow();
        setMap(created);
        setStatus("ready");
        countMapLoad();
      } catch (e) {
        if (!cancelled) { setProblem(e.message in MESSAGES ? e.message : "script-blocked"); setStatus("error"); }
      }
    })();
    return () => {
      cancelled = true;
      stopAuth();
      markersRef.current.forEach((m) => { m.map = null; });
      markersRef.current = [];
      mapRef.current = null;
      infoRef.current = null;
      setMap(null);
      if (box) box.innerHTML = "";
    };
  }, [theme]);

  useEffect(() => {
    if (!map) return;
    let stale = false;
    (async () => {
      const google = window.google;
      const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
      const { LatLngBounds } = await google.maps.importLibrary("core");
      if (stale || mapRef.current !== map) return;

      markersRef.current.forEach((m) => { m.map = null; });
      markersRef.current = pins.map((pin) => {
        const marker = new AdvancedMarkerElement({
          map,
          position: { lat: pin.lat, lng: pin.lng },
          content: cuisinePinElement(pin.cuisine, pin.ring, pin.emoji),
          title: pin.name,
        });
        const open = () => {
          infoRef.current?.setContent(popupContent(pin));
          infoRef.current?.open({ anchor: marker, map });
        };
        marker.addListener("click", open);
        return marker;
      });

      if (pins.length === 1) {
        map.setCenter({ lat: pins[0].lat, lng: pins[0].lng });
        map.setZoom(14);
      } else if (pins.length > 1) {
        const bounds = new LatLngBounds();
        pins.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
        map.fitBounds(bounds, 48);
        // A few pins on one block shouldn't zoom in to rooftops.
        google.maps.event.addListenerOnce(map, "idle", () => { if (map.getZoom() > 15) map.setZoom(15); });
      }
    })();
    return () => { stale = true; };
    // pinsKey (the pins as text) stands in for `pins`, which is a new array
    // on every render even when nothing changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, pinsKey]);

  return (
    <div style={{ position: "relative", height: 420, borderRadius: 12, overflow: "hidden", border: `1px solid ${C.cardEdge}`, background: C.card }}>
      <div ref={boxRef} style={{ height: "100%", width: "100%" }} />
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center text-sm" style={{ color: C.muted }}>Loading the map...</div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm" style={{ background: C.card, color: C.muted }}>
          {MESSAGES[problem] || MESSAGES["script-blocked"]}
        </div>
      )}
    </div>
  );
}
