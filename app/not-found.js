"use client";

import Link from "next/link";
import { C, display, FontShell, LogoMark, useTheme } from "./theme";

// Shown for any address that doesn't exist - a mistyped link, an old shared
// link, a restaurant page that was never made. Matches the crash page
// (app/error.js) so every dead end feels like Nomarchy.
export default function NotFound() {
  useTheme();
  return (
    <FontShell>
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-5 text-center">
        <LogoMark size={40} />
        <h1 className="mt-4 text-2xl" style={{ ...display, fontWeight: 800 }}>This page has left the kingdom</h1>
        <p className="mt-2 text-sm" style={{ color: C.muted }}>
          We couldn&apos;t find what you were looking for. The link may be mistyped or out of date.
        </p>
        <Link href="/" className="mt-5 rounded-lg px-5 py-2.5 text-sm font-bold" style={{ background: C.gold, color: C.onGold }}>
          Back to Nomarchy
        </Link>
        <Link href="/faq" className="mt-3 text-sm font-semibold" style={{ color: C.goldText }}>How Nomarchy works</Link>
      </div>
    </FontShell>
  );
}
