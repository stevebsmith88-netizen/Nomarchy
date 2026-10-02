"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { C, display, FontShell, LogoMark, useTheme } from "./theme";
import { reportError } from "@/lib/errorReporting";

// Shown instead of a blank screen if a page crashes. The error is reported
// (Admin > Errors) so it can be fixed.
export default function Error({ error, retry }) {
  useTheme();
  useEffect(() => {
    reportError({ message: error?.message || "Page crashed", stack: error?.stack || "", page: window.location.pathname, userAgent: navigator.userAgent });
  }, [error]);

  return (
    <FontShell>
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center px-5 text-center">
        <LogoMark size={40} />
        <h1 className="mt-4 text-2xl" style={{ ...display, fontWeight: 800 }}>Something went wrong</h1>
        <p className="mt-2 text-sm" style={{ color: C.muted }}>
          Sorry about that - it&apos;s been reported so we can fix it. Your kingdom is safe.
        </p>
        <button onClick={() => retry()} className="mt-5 rounded-lg px-5 py-2.5 text-sm font-bold" style={{ background: C.gold, color: C.onGold }}>
          Try again
        </button>
        <Link href="/" className="mt-3 text-sm font-semibold" style={{ color: C.goldText }}>Back to Nomarchy</Link>
      </div>
    </FontShell>
  );
}
