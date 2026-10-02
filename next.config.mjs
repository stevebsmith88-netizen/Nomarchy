// Baseline hardening headers. Nomarchy doesn't embed third-party frames or
// scripts beyond what's listed below, so this can stay tight rather than
// growing a permissive allowlist over time.
const securityHeaders = [
  // Nobody else's page gets to load Nomarchy in a hidden iframe (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  // Stop the browser from guessing content types and executing something
  // it shouldn't based on a sniffed MIME type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak the full referring URL (which can contain a username) to
  // external sites linked from the app, e.g. a restaurant's maps link.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nomarchy only ever needs the device's location (for "near me"); switch
  // off everything else the browser could otherwise be asked for.
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js needs inline/eval script allowances in its own runtime.
      // Google Maps: its loader script and the code it pulls in.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://*.googleapis.com https://*.gstatic.com *.google.com https://*.ggpht.com *.googleusercontent.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      // Supabase (API + auth) and Google Fonts CSS are the only external calls this app makes.
      "connect-src 'self' data: blob: https://*.supabase.co https://*.googleapis.com *.google.com https://*.gstatic.com",
      // Google's vector maps draw in a web worker created from a blob.
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
