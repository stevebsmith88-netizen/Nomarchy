"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { C, display } from "./theme";

// The first-time walkthrough: dims the screen, highlights one thing at a
// time and explains it in a small box with an arrow. Each step names the
// tab to be on and the element to point at (a data-tour attribute in
// page.js). If an element can't be found the step still shows, centred
// with no arrow, so a missing target never blocks the tour.
export const TOUR_STEPS = [
  { tab: "kingdom", target: '[data-tour="tab-kingdom"]', title: "Welcome to your kingdom", text: "Each cuisine has one throne, and this is where your favourites live. Choose like it matters." },
  { tab: "kingdom", target: '[data-tour="first-throne"]', title: "Crown your first favourite", text: "Tap a throne to crown a place, and say why it earned it." },
  { tab: "pretenders", target: '[data-tour="tab-pretenders"]', title: "Next in Line", text: "Places you want to try. Add one, or paste in a whole list from your notes." },
  { tab: "court", target: '[data-tour="tab-court"]', title: "Your Court", text: "Follow friends by username to see their crowns, and endorse the ones you agree with." },
  { tab: "top25", target: '[data-tour="tab-top25"]', title: "Best in the Land", text: "The most-crowned restaurants across everyone's kingdoms." },
  { tab: "kingdom", target: '[data-tour="bell"]', title: "Keep up, and make it yours", text: "The bell shows what's new - friends' crowns, follows and updates. Tap your name above for your profile: stats, settings, light or dark mode, and this tour again." },
];

const PAD = 6;
const MARGIN = 16;

export default function Tour({ steps = TOUR_STEPS, onSetTab, onDone }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [boxH, setBoxH] = useState(170);
  const [vp, setVp] = useState({ w: 360, h: 640 });
  const boxRef = useRef(null);
  const nextRef = useRef(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  const measure = useCallback(() => {
    setVp({ w: window.innerWidth, h: window.innerHeight });
    const el = step.target ? document.querySelector(step.target) : null;
    if (!el) { setRect(null); return false; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    return true;
  }, [step]);

  // On each step: go to its tab, wait briefly for the element to exist,
  // bring it into view, then measure it.
  useEffect(() => {
    onSetTab?.(step.tab);
    let cancelled = false;
    let tries = 0;
    let timer;
    const attempt = () => {
      if (cancelled) return;
      const el = step.target ? document.querySelector(step.target) : null;
      if (el) {
        el.scrollIntoView({ block: "center" });
        requestAnimationFrame(() => requestAnimationFrame(() => { if (!cancelled) measure(); }));
      } else if (tries++ < 15) {
        timer = setTimeout(attempt, 100);
      } else {
        measure();
      }
    };
    attempt();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the highlight on target if the screen is resized or scrolled.
  useEffect(() => {
    let frame;
    const onChange = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => { window.removeEventListener("resize", onChange); window.removeEventListener("scroll", onChange, true); cancelAnimationFrame(frame); };
  }, [measure]);

  useLayoutEffect(() => {
    if (boxRef.current) setBoxH(boxRef.current.offsetHeight);
  }, [index, rect, vp.w]);

  useEffect(() => { nextRef.current?.focus(); }, [index]);

  const finish = useCallback(() => onDone?.(), [onDone]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  const boxW = Math.min(320, vp.w - MARGIN * 2);
  let top, left, arrow = null;
  if (rect) {
    const centreX = rect.left + rect.width / 2;
    left = Math.min(Math.max(centreX - boxW / 2, MARGIN), vp.w - boxW - MARGIN);
    const below = rect.top + rect.height + PAD + 14;
    const above = rect.top - PAD - 14 - boxH;
    const arrowLeft = Math.min(Math.max(centreX - left, 22), boxW - 22);
    if (below + boxH <= vp.h - 8) { top = below; arrow = { side: "top", left: arrowLeft }; }
    else if (above >= 8) { top = above; arrow = { side: "bottom", left: arrowLeft }; }
    else { top = Math.max(8, vp.h - boxH - 12); }
  } else {
    left = (vp.w - boxW) / 2;
    top = Math.max(8, (vp.h - boxH) / 2);
  }

  return (
    <div className="fixed inset-0 z-[1300]" onClick={(e) => e.stopPropagation()} style={{ background: rect ? "transparent" : "rgba(10,5,16,0.72)" }}>
      {rect && (
        <div
          aria-hidden="true"
          data-tour-spotlight
          style={{
            position: "fixed",
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            borderRadius: 14,
            border: `2px solid ${C.gold}`,
            boxShadow: "0 0 0 9999px rgba(10,5,16,0.72)",
            pointerEvents: "none",
          }}
        />
      )}
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Tour: ${step.title}`}
        data-tour-box
        className="rounded-2xl p-4 text-left"
        style={{ position: "fixed", top, left, width: boxW, background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream, boxShadow: "0 12px 32px rgba(0,0,0,0.45)" }}
      >
        {arrow && (
          <span
            aria-hidden="true"
            data-tour-arrow
            style={{
              position: "absolute",
              left: arrow.left - 7,
              [arrow.side === "top" ? "top" : "bottom"]: -8,
              width: 14,
              height: 14,
              background: C.card,
              transform: "rotate(45deg)",
              borderLeft: arrow.side === "top" ? `1px solid ${C.cardEdge}` : "none",
              borderTop: arrow.side === "top" ? `1px solid ${C.cardEdge}` : "none",
              borderRight: arrow.side === "bottom" ? `1px solid ${C.cardEdge}` : "none",
              borderBottom: arrow.side === "bottom" ? `1px solid ${C.cardEdge}` : "none",
            }}
          />
        )}
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>{index + 1} of {steps.length}</div>
          <button onClick={finish} className="text-xs font-semibold" style={{ color: C.muted }}>Skip tour</button>
        </div>
        <h3 className="mt-1.5 text-lg" style={{ ...display, fontWeight: 800 }}>{step.title}</h3>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: C.cream + "DD" }}>{step.text}</p>
        <div className="mt-3 flex items-center justify-end gap-2">
          {index > 0 && (
            <button onClick={() => setIndex((i) => i - 1)} className="rounded-lg px-3 py-2 text-sm font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}>Back</button>
          )}
          <button ref={nextRef} onClick={() => (last ? finish() : setIndex((i) => i + 1))} className="rounded-lg px-4 py-2 text-sm font-bold" style={{ background: C.gold, color: C.bg }}>
            {last ? "Done" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
