"use client";

import { useEffect } from "react";

// App-wide keyboard and screen-reader behaviour for pop-ups, in one place
// rather than repeated in every modal:
// - Esc closes the top-most pop-up (each pop-up's dimmed backdrop is marked
//   data-modal-backdrop and already closes it when clicked).
// - When a pop-up opens, focus moves into it, so keyboard and screen-reader
//   users land where the content is; when it closes, focus goes back to
//   where they were.
export default function A11yHelpers() {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("[data-tour-box]")) return; // the tour handles its own Esc
      const backdrops = document.querySelectorAll("[data-modal-backdrop]");
      const top = backdrops[backdrops.length - 1];
      if (top) { e.preventDefault(); top.click(); }
    };
    window.addEventListener("keydown", onKey);

    let lastFocus = null;
    let openDialog = null;
    const observer = new MutationObserver(() => {
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      const current = dialogs[dialogs.length - 1] || null;
      if (current && current !== openDialog) {
        if (!openDialog) lastFocus = document.activeElement;
        openDialog = current;
        if (!current.contains(document.activeElement)) current.focus({ preventScroll: true });
      } else if (!current && openDialog) {
        openDialog = null;
        if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
        lastFocus = null;
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => { window.removeEventListener("keydown", onKey); observer.disconnect(); };
  }, []);
  return null;
}
