"use client";

import { useState } from "react";
import { C, display } from "../theme";
import { ClosedBadge, CuisineEmojiGrid, PhotoPicker } from "./shared";
import { safeMapsUrl } from "@/lib/safeUrl";
import { Check, ChevronDown, Crown, ExternalLink, Loader2, MapPin, Pencil, RotateCcw, ScrollText, Share2, Swords, Trash2, X } from "lucide-react";

export function PretenderCard({ p, closed, selectableCuisines, onRemove, onChangeNote, onChangeCuisine, onChangePhotos, onToggleVisited, onChangeVerdict, onCrown, onShare, userId, friendMatches }) {
  // Compact by default - name, cuisine and area - and opens on tap to show
  // the note, photos, verdict and actions. Leaving it closed keeps a long
  // list scannable.
  const [open, setOpen] = useState(false);
  const cuisineName = selectableCuisines.find((c) => c.id === p.cuisineId)?.name || p.cuisine || null;
  const courtCount = friendMatches?.length || 0;
  return (
    <div className="mb-2 rounded-xl p-3.5" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, opacity: closed ? 0.5 : p.visitedAt ? 0.7 : 1 }}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <h3 className="flex flex-wrap items-center gap-1.5 text-base" style={{ ...display, fontWeight: 700 }}>
            {p.name}
            {closed && <ClosedBadge />}
            {p.visitedAt && <Check size={14} style={{ color: C.green }} />}
            {p.verdict && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                style={p.verdict === "worth_it" ? { background: C.green + "22", color: C.green } : { background: C.cardEdge, color: C.muted }}
              >
                {p.verdict === "worth_it" ? "Worth it" : "Not for me"}
              </span>
            )}
            {courtCount > 0 && !open && (
              <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: C.gold + "22", color: C.goldText }}>
                <Crown size={10} /> {courtCount} from Court
              </span>
            )}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs" style={{ color: C.muted }}>
            {[cuisineName, p.area || p.address].filter(Boolean).join(" · ") || "Uncategorized"}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          {open && onShare && (
            <button onClick={() => onShare(p)} aria-label="Share" className="p-1" style={{ color: C.muted }}><Share2 size={15} /></button>
          )}
          <button onClick={() => setOpen((v) => !v)} aria-label={open ? "Close details" : "Open details"} className="p-1" style={{ color: C.muted }}>
            <ChevronDown size={16} className="transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
          </button>
        </div>
      </div>
      {open && (<>
        {safeMapsUrl(p.mapsUrl) && (
          <a href={safeMapsUrl(p.mapsUrl)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-0.5 text-xs font-semibold" style={{ color: C.goldText }}>
            <MapPin size={11} /> Map <ExternalLink size={10} />
          </a>
        )}
      {friendMatches && friendMatches.length > 0 && (
        <div className="mt-2 rounded-lg p-2.5" style={{ background: C.bg, border: `1px dashed ${C.gold}66` }}>
          {friendMatches.slice(0, 2).map((m, i) => (
            <p key={i} className="text-xs leading-relaxed" style={{ color: C.cream + "CC" }}>
              {m.crowned ? <Crown size={11} className="mr-1 inline" style={{ color: C.goldText }} /> : <Check size={11} className="mr-1 inline" style={{ color: C.green }} />}
              <strong>{m.friend}</strong>{m.crowned ? ` crowned this for ${m.cuisine}` : "'s been"}
              {m.verdict && <> - <span style={{ color: m.verdict === "worth_it" ? C.green : C.muted, fontWeight: 700 }}>{m.verdict === "worth_it" ? "Worth it" : "Not for me"}</span></>}
              {m.text && <>: &ldquo;{m.text}&rdquo;</>}
            </p>
          ))}
          {friendMatches.length > 2 && (
            <p className="text-xs" style={{ color: C.muted }}>+{friendMatches.length - 2} more from your Court</p>
          )}
        </div>
      )}
      <textarea aria-label={p.visitedAt ? "Your review" : "Your note"}
        key={p.id + (p.note || "")}
        defaultValue={p.note || ""}
        onBlur={(e) => { if (e.target.value !== (p.note || "")) onChangeNote(p.id, e.target.value.trim()); }}
        placeholder={p.visitedAt ? "Write a review - visible to friends who follow you" : "Note (optional, private until you've been)"}
        rows={2}
        className="mt-2 w-full rounded-lg px-3 py-2 text-sm italic outline-none"
        style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
      />
      {p.visitedAt && onChangeVerdict && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={() => onChangeVerdict(p.id, p.verdict === "worth_it" ? null : "worth_it")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
            style={p.verdict === "worth_it" ? { background: C.green + "22", color: C.green, border: `1px solid ${C.green}66` } : { color: C.muted, border: `1px solid ${C.cardEdge}` }}
          >
            <Check size={13} /> Worth it
          </button>
          <button
            onClick={() => onChangeVerdict(p.id, p.verdict === "not_for_me" ? null : "not_for_me")}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
            style={p.verdict === "not_for_me" ? { background: C.cardEdge, color: C.cream, border: `1px solid ${C.cardEdge}` } : { color: C.muted, border: `1px solid ${C.cardEdge}` }}
          >
            <X size={13} /> Not for me
          </button>
        </div>
      )}
      <select aria-label="Cuisine"
        value={p.cuisineId || ""}
        onChange={(e) => onChangeCuisine(p.id, e.target.value)}
        className="mt-2 rounded px-2 py-1 text-xs outline-none"
        style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: p.cuisineId ? C.cream : C.muted }}
      >
        <option value="">Uncategorized</option>
        {selectableCuisines.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {p.visitedAt && <PhotoPicker userId={userId} photos={p.photos || []} onChange={(photos) => onChangePhotos(p.id, photos)} removeInViewer />}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => onCrown(p)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.gold, color: C.onGold }}>
          <Crown size={13} /> Crown it
        </button>
        <button
          onClick={() => onToggleVisited(p.id, !!p.visitedAt, p.cuisineId, p.note, p.verdict)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
          style={p.visitedAt ? { background: C.green + "22", color: C.green, border: `1px solid ${C.green}66` } : { color: C.muted, border: `1px solid ${C.cardEdge}` }}>
          <Check size={13} /> {p.visitedAt ? "Been here" : "Mark as been"}
        </button>
        {/* Delete sits alone at the far end of the action row, away from
            Share at the top of the card - the two used to be side by side,
            which made it easy to hit the destructive one by mistake. */}
        <button onClick={() => onRemove(p.id)} aria-label="Remove" className="ml-auto p-1.5" style={{ color: C.muted }}><Trash2 size={15} /></button>
      </div>
      </>)}
    </div>
  );
}

export function ThroneCard({ cuisineName, cuisineId, slot, closed, cuisineEmoji, onChangeEmoji, featured, historyOpen, setHistoryOpen, setModal, sharePick, fmt, emptyCuisines, onMoveCuisine, onUnCrown, onEditDecree, onEditLocation, onEditPhotos, onHide, userId }) {
  const r = slot?.current;

  // One edit panel covers both the decree text and the cuisine it's filed
  // under - these used to be two separate buttons ("Edit review" and "Wrong
  // category?"), which just meant hunting for the right one. A pencil icon
  // reads as "edit" on its own, so there's no need to spell it out either.
  const [editing, setEditing] = useState(false);
  const [pickingEmoji, setPickingEmoji] = useState(false);
  const [decreeText, setDecreeText] = useState("");
  const [targetCuisineId, setTargetCuisineId] = useState("");
  const [addressText, setAddressText] = useState("");
  const [areaText, setAreaText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  const startEdit = () => {
    setDecreeText(r.decree);
    setTargetCuisineId(cuisineId || "");
    setAddressText(r.address || "");
    setAreaText(r.area || "");
    setSaveErr("");
    setEditing(true);
  };

  const confirmEdit = async () => {
    if (decreeText.trim().length < 30 || saving) return;
    setSaving(true); setSaveErr("");
    try {
      if (onEditDecree && decreeText.trim() !== r.decree) await onEditDecree(decreeText.trim());
      if (onMoveCuisine && targetCuisineId && targetCuisineId !== cuisineId) await onMoveCuisine(targetCuisineId);
      if (onEditLocation && (addressText.trim() !== (r.address || "") || areaText.trim() !== (r.area || ""))) {
        await onEditLocation({ address: addressText.trim(), neighbourhood: areaText.trim() });
      }
      setEditing(false);
    } catch (e) {
      setSaveErr(e.message || "Couldn't save that.");
    }
    setSaving(false);
  };

  const coupButton = (
    <button onClick={() => setModal({ cuisineId, cuisineName, mode: "coup" })} className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.coup + "22", color: C.coup, border: `1px solid ${C.coup}66` }}><Swords size={13} /> Coup</button>
  );

  return (
    <div
      className="rounded-xl p-4"
      data-tour={featured ? "first-throne" : undefined}
      style={{
        background: C.card,
        border: `${featured ? 2 : 1}px solid ${r ? C.gold + "55" : C.cardEdge}`,
        boxShadow: featured ? `0 0 0 1px ${C.gold}33` : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          {onChangeEmoji && (
            <button type="button" onClick={() => setPickingEmoji((v) => !v)} aria-label="Change this cuisine's icon" className="flex h-6 w-6 items-center justify-center rounded-full text-sm" style={{ background: C.bg, border: `1px solid ${pickingEmoji ? C.gold : C.cardEdge}` }}>
              {cuisineEmoji}
            </button>
          )}
          <span className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.14em" }}>{cuisineName}</span>
        </span>
        {r && (
          <button onClick={() => sharePick(cuisineName, r)} aria-label="Share" className="p-1" style={{ color: C.muted }}><Share2 size={15} /></button>
        )}
      </div>
      {pickingEmoji && onChangeEmoji && <CuisineEmojiGrid onPick={(emoji) => { onChangeEmoji(emoji); setPickingEmoji(false); }} />}
      {r ? (<div className="mt-2">
        <h3 className={featured ? "text-2xl" : "text-xl"} style={{ ...display, fontWeight: 700 }}>
          {r.name}
          <Crown size={featured ? 18 : 16} className="relative -top-0.5 ml-2 inline" style={{ color: C.goldText }} fill={C.gold} strokeWidth={0} />
          {closed && <ClosedBadge />}
        </h3>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs" style={{ color: C.muted }}>
          {(r.area || r.address) && (<><MapPin size={11} /> {r.area || r.address}<span className="mx-1">·</span></>)}
          crowned {fmt(r.crownedAt)}
          {safeMapsUrl(r.mapsUrl) && <a href={safeMapsUrl(r.mapsUrl)} target="_blank" rel="noreferrer" className="ml-1 flex items-center gap-0.5 font-semibold" style={{ color: C.goldText }}>Map <ExternalLink size={10} /></a>}
        </div>
        {editing ? (
          <div className="mt-2">
            <textarea aria-label="Your decree"
              autoFocus
              value={decreeText}
              onChange={(e) => setDecreeText(e.target.value)}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
            />
            <div className="mt-1 text-xs" style={{ color: decreeText.trim().length < 30 ? C.coup : C.muted }}>{decreeText.trim().length}/30 minimum</div>
            {onMoveCuisine && (
              <div className="mt-2">
                <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Cuisine</label>
                <select aria-label="Cuisine" value={targetCuisineId} onChange={(e) => setTargetCuisineId(e.target.value)} className="mt-1 w-full rounded-lg px-2 py-1.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }}>
                  <option value={cuisineId}>{cuisineName} (current)</option>
                  {(emptyCuisines || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {onEditLocation && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Address</label>
                  <input aria-label="Street address" value={addressText} onChange={(e) => setAddressText(e.target.value)} placeholder="Street address" className="mt-1 w-full rounded-lg px-2 py-1.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Neighbourhood</label>
                  <input aria-label="Neighbourhood" value={areaText} onChange={(e) => setAreaText(e.target.value)} placeholder="Neighbourhood" className="mt-1 w-full rounded-lg px-2 py-1.5 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.cardEdge}`, color: C.cream }} />
                </div>
              </div>
            )}
            {saveErr && <p className="mt-1 text-xs" style={{ color: C.coup }}>{saveErr}</p>}
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => setEditing(false)} className="rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}>Cancel</button>
              <button disabled={decreeText.trim().length < 30 || saving} onClick={confirmEdit} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={decreeText.trim().length >= 30 ? { background: C.gold, color: C.onGold } : { background: C.cardEdge, color: C.muted }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
              </button>
              {/* Un-crown lives here, behind the edit pencil, rather than
                  sitting on the card at all times - it's the one action
                  here that takes the pick off the throne, so it should
                  take a deliberate step to reach. */}
              {onUnCrown && (
                <button onClick={() => { setEditing(false); onUnCrown(); }} className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}><RotateCcw size={13} /> Un-crown</button>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm leading-relaxed" style={{ color: C.cream + "E6" }}>
            <ScrollText size={13} className="mr-1 inline" style={{ color: C.goldText }} />{r.decree}
            {(onEditDecree || onMoveCuisine || onEditLocation) && (
              <button onClick={startEdit} aria-label="Edit" title="Edit" className="ml-1.5 inline-flex align-middle rounded p-1" style={{ color: C.muted }}>
                <Pencil size={12} />
              </button>
            )}
          </p>
        )}
        {/* Coup shares a row with Add photo whenever photos are editable -
            otherwise it sat alone on its own row with a dead gap beside it. */}
        {onEditPhotos
          ? <PhotoPicker userId={userId} photos={r.photos || []} onChange={(photos) => onEditPhotos(photos)} action={coupButton} canRemove={editing || !(onEditDecree || onMoveCuisine || onEditLocation)} />
          : <div className="mt-3 flex justify-end">{coupButton}</div>}
      </div>) : (<div className="mt-2">
        <p className="text-sm italic" style={{ color: C.muted }}>{featured ? "No overall favourite crowned yet." : "This throne sits empty."}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => setModal({ cuisineId, cuisineName, mode: "claim" })} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ background: C.gold, color: C.onGold }}><Crown size={13} /> {featured ? "Crown your favourite" : "Crown a spot"}</button>
          {onHide && (
            <button onClick={onHide} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold" style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}><X size={13} /> Hide this cuisine</button>
          )}
        </div>
      </div>)}
    </div>
  );
}
