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

// A fixed dark badge regardless of the app's own light/dark theme - it
// sits on top of map imagery, so it needs to read clearly against either
// map style rather than flip to a light background that would wash out.
const BADGE_BG = "#2A1E38";

// Ring color is the only thing that still carries "been" vs "still to
// try" (NextInLineMap) or just marks a crowned throne (KingdomMap) - the
// emoji's job is purely "what cuisine", so the two meanings never
// collide on one pin. Fixed hex rather than reading C.gold/etc: what
// matters here is contrast against the map, not matching whichever app
// theme happens to be active.
export const PIN_GOLD = "#E2B340";
export const PIN_BLUE = "#4A80C7";

// Builds a small circular, emoji-filled pin with a pointed tail, as a plain
// DOM element for a Google Maps AdvancedMarkerElement - no marker images to
// keep in sync per cuisine. The element's bottom-centre (the tip of the
// tail) sits on the place's coordinates. Built with the DOM, never an HTML
// string, so a cuisine name can't inject anything.
export function cuisinePinElement(cuisine, ringColor) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:relative;width:30px;height:38px;cursor:pointer;";

  const badge = document.createElement("div");
  badge.style.cssText = `box-sizing:border-box;width:30px;height:30px;border-radius:50%;background:${BADGE_BG};border:2.5px solid ${ringColor};display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,.45);`;
  badge.textContent = getCuisineEmoji(cuisine);

  const tail = document.createElement("div");
  tail.style.cssText = `position:absolute;left:50%;bottom:0;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid ${ringColor};transform:translateX(-50%);`;

  wrap.append(badge, tail);
  return wrap;
}
