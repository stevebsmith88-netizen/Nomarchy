"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/errorReporting";

// Catches errors anywhere in the app in someone's browser and reports them
// (see lib/errorReporting.js). At most 10 reports per visit, and the same
// error only once, so one broken screen can't send a stream of them.
export default function ErrorReporter() {
  useEffect(() => {
    const sent = new Set();
    const send = (message, stack) => {
      if (!message || sent.has(message) || sent.size >= 10) return;
      sent.add(message);
      reportError({ message, stack, page: window.location.pathname, userAgent: navigator.userAgent });
    };
    const onError = (e) => send(e?.error?.message || e?.message, e?.error?.stack || "");
    const onRejection = (e) => {
      const r = e?.reason;
      send(r?.message || (typeof r === "string" ? r : ""), r?.stack || "");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
