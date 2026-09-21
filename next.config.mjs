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
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js needs inline/eval script allowances in its own runtime.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      // Supabase (API + auth) and Google Fonts CSS are the only external calls this app makes.
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  // Vercel sets this automatically at build time (not client-visible by
  // default) - surfacing it lets the owner-only debug line in app/page.js
  // confirm two devices are actually running the same deployment.
  env: {
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA || "",
  },
};

export default nextConfig;
