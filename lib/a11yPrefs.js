// Per-person accessibility choices (Your Profile > Accessibility). Kept in
// the browser so they apply instantly on every load (the inline script in
// app/layout.js reads the same key before the page paints), and saved on
// the account so they follow the person to another phone.

export const A11Y_DEFAULTS = {
  motion: "system",          // "system" (match the phone), "on" (reduce), "off" (full motion)
  calmCelebrations: false,   // rank promotions as a short message, not a full-screen takeover
  largerText: false,         // everything about 15% bigger, small labels included
  stickyMessages: false,     // pop-up messages stay until dismissed
};

const KEY = "nomarchy-a11y";

export function normalizeA11y(value) {
  const v = value && typeof value === "object" ? value : {};
  return {
    motion: ["system", "on", "off"].includes(v.motion) ? v.motion : A11Y_DEFAULTS.motion,
    calmCelebrations: v.calmCelebrations === true,
    largerText: v.largerText === true,
    stickyMessages: v.stickyMessages === true,
  };
}

export function readLocalA11y() {
  try { return normalizeA11y(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return { ...A11Y_DEFAULTS }; }
}

// Applies the choices to the page (attributes the CSS in globals.css looks
// for) and remembers them on this device.
export function applyA11y(prefs) {
  const p = normalizeA11y(prefs);
  const root = document.documentElement;
  if (p.motion === "on") root.setAttribute("data-motion", "reduce");
  else if (p.motion === "off") root.setAttribute("data-motion", "full");
  else root.removeAttribute("data-motion");
  if (p.largerText) root.setAttribute("data-text", "large");
  else root.removeAttribute("data-text");
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  return p;
}

export function isDefaultA11y(prefs) {
  const p = normalizeA11y(prefs);
  return Object.keys(A11Y_DEFAULTS).every((k) => p[k] === A11Y_DEFAULTS[k]);
}
