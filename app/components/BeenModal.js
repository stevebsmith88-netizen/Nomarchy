"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { C, display } from "../theme";

// Shown when someone taps "Mark as been" on a Next in Line place: a chance to
// say how it was (Worth it / Not for me, and a review) before it moves to Been
// to. Everything is optional. Save marks it as been with what's entered;
// "Skip for now" marks it as been with nothing added (the usual jokey
// placeholder note goes in); closing the pop-up leaves the place on the list.
export default function BeenModal({ name, initialNote = "", initialVerdict = null, onSave, onSkip, onClose }) {
  const [note, setNote] = useState(initialNote);
  const [verdict, setVerdict] = useState(initialVerdict);
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  return (
    <div data-modal-backdrop className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`How was ${name}?`} tabIndex={-1} className="w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>Been to {name}. How was it?</h3>
          <button onClick={onClose} aria-label="Close" className="shrink-0" style={{ color: C.muted }}><X size={18} /></button>
        </div>
        <p className="mt-1 text-xs" style={{ color: C.muted }}>Both are optional. Friends who follow you can see your review.</p>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            aria-pressed={verdict === "worth_it"}
            onClick={() => setVerdict(verdict === "worth_it" ? null : "worth_it")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
            style={verdict === "worth_it" ? { background: C.green + "22", color: C.green, border: `1px solid ${C.green}66` } : { color: C.muted, border: `1px solid ${C.cardEdge}` }}
          >
            <Check size={13} /> Worth it
          </button>
          <button
            type="button"
            aria-pressed={verdict === "not_for_me"}
            onClick={() => setVerdict(verdict === "not_for_me" ? null : "not_for_me")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
            style={verdict === "not_for_me" ? { background: C.cardEdge, color: C.cream, border: `1px solid ${C.cardEdge}` } : { color: C.muted, border: `1px solid ${C.cardEdge}` }}
          >
            <X size={13} /> Not for me
          </button>
        </div>

        <textarea
          aria-label="Your review (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={5000}
          rows={4}
          autoFocus
          placeholder="Write a review - visible to friends who follow you"
          className="mt-3 w-full rounded-lg px-3 py-2.5 text-sm italic outline-none"
          style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
        />

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => run(() => onSave({ note, verdict }))}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold"
            style={{ background: C.gold, color: C.onGold }}
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Save
          </button>
          <button type="button" onClick={() => run(() => onSkip({ note, verdict }))} disabled={busy} className="text-sm font-semibold underline" style={{ color: C.muted }}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
