// Loads Google's Maps JavaScript API once, only when a map is first shown.
// Uses the browser key (NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY), which is meant
// to be visible - it's locked to nomarchy.ca and the Maps API in Google
// Cloud. Rejects with a short reason a map can show instead of a blank box:
//   "missing-key"    the key isn't set in this deployment
//   "script-blocked" the script couldn't load (offline, or blocked by the
//                    browser or the site's security headers)

let loading = null;
const authListeners = new Set();

// Google calls window.gm_authFailure when it refuses the key (wrong
// website, API not enabled, billing problem).
export function onMapsAuthFailure(callback) {
  authListeners.add(callback);
  return () => authListeners.delete(callback);
}

export function loadGoogleMaps() {
  if (typeof window === "undefined") return Promise.reject(new Error("script-blocked"));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google);
  if (loading) return loading;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  if (!key) return Promise.reject(new Error("missing-key"));

  loading = new Promise((resolve, reject) => {
    window.gm_authFailure = () => authListeners.forEach((cb) => cb());
    window.__nomarchyMapsReady = () => resolve(window.google);
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__nomarchyMapsReady`;
    script.async = true;
    script.onerror = () => {
      loading = null;
      reject(new Error("script-blocked"));
    };
    document.head.appendChild(script);
  });
  return loading;
}
