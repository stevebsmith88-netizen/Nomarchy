import L from "leaflet";

// Shared cuisine -> emoji mapping and pin-icon builder for KingdomMap and
// NextInLineMap - one definition so both maps' pins stay visually
// consistent, and so a new default cuisine only needs an emoji added here
// once. Keyed on the cuisine's exact display name (what both maps already
// pass through as `p.cuisine`), matching the seed list in schema.sql.
const CUISINE_EMOJI = {
  "Breakfast and Brunch": "🥞",
  "Burgers": "🍔",
  "Pizza": "🍕",
  "Coffee": "☕",
  "Sushi": "🍣",
  "Italian": "🍝",
  "Chinese": "🥡",
  "Indian": "🍛",
  "Shawarma and Middle Eastern": "🧆",
  "Thai": "🍲",
  "Japanese and Ramen": "🍜",
  "Mexican": "🌮",
  "Caribbean": "🍗",
  "Greek": "🥙",
  "Korean": "🥢",
  "Vietnamese": "🥖",
  "Steak": "🥩",
  "Dessert and Bakery": "🍰",
  "Persian": "🍢",
  "Portuguese": "🍤",
  "Filipino": "🍚",
  "Sri Lankan": "🥥",
  "Ethiopian": "🫓",
  "Jewish Deli": "🥪",
  "Polish and Eastern European": "🥟",
  "Cheap Eat": "💸",
  "Special Occasion": "🥂",
  "Quick Bite": "⚡",
  "Overall Favourite": "👑",
};

// A custom cuisine someone's added themselves, or anything that doesn't
// match the list above, still needs a pin - a generic plate rather than
// no icon at all.
const DEFAULT_EMOJI = "🍽️";

export function getCuisineEmoji(cuisine) {
  return CUISINE_EMOJI[cuisine] || DEFAULT_EMOJI;
}

// A fixed dark badge regardless of the app's own light/dark theme - these
// sit on top of OpenStreetMap tiles, which don't change with it, so the
// badge needs to read clearly against map imagery either way rather than
// flip to a light background that would wash out on the map.
const BADGE_BG = "#2A1E38";

// Ring color is the only thing that still carries "been" vs "still to
// try" (NextInLineMap) or just marks a crowned throne (KingdomMap) - the
// emoji's job is purely "what cuisine", so the two meanings never
// collide on one pin. Fixed hex rather than reading C.gold/etc: these are
// baked into a Leaflet icon at creation time, not a live-reacting style,
// and matter more here is contrast against the map than matching
// whichever app theme happens to be active.
export const PIN_GOLD = "#E2B340";
export const PIN_BLUE = "#4A80C7";

// Builds a small circular, emoji-filled pin with a pointed tail - plain
// CSS in a Leaflet divIcon, no extra marker-image assets to keep in sync
// per cuisine. Memoized per (emoji, ringColor) pair since a long pin list
// otherwise re-parses the same handful of icon strings on every render.
const cache = new Map();

export function cuisinePinIcon(cuisine, ringColor) {
  const emoji = getCuisineEmoji(cuisine);
  const key = `${emoji}|${ringColor}`;
  if (cache.has(key)) return cache.get(key);

  const icon = L.divIcon({
    html: `
      <div style="position:relative;width:30px;height:38px;">
        <div style="width:30px;height:30px;border-radius:50%;background:${BADGE_BG};border:2.5px solid ${ringColor};display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,.45);">${emoji}</div>
        <div style="position:absolute;left:50%;bottom:0;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid ${ringColor};transform:translateX(-50%);"></div>
      </div>`,
    className: "",
    iconSize: [30, 38],
    iconAnchor: [15, 38],
    popupAnchor: [0, -38],
  });
  cache.set(key, icon);
  return icon;
}
