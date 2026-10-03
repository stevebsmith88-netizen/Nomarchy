"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { C, display, useTheme } from "../theme";
import { AvatarPicker, GoogleIcon, ProfileSection, RankLadder, RowSkeleton } from "./shared";
import { getLinkedProviders, linkGoogle, loadBlockedUsers, loadConquestProgress, unblockUser, unlinkGoogle } from "@/lib/data";
import { Check, Crown, Globe, Loader2, Lock, Mail, MessageSquare, Search, Trash2, X } from "lucide-react";

export function ProfileModal({ profile, title, rank, nextRank, score, stats, onClose, onSubmit, onChangeAvatar, onDeleteAccount, onFeedback, onTour, a11y, onChangeA11y }) {
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState(profile?.username || "");
  const [displayName, setDisplayName] = useState(profile?.display_name || "");
  const [city, setCity] = useState(profile?.city || "");
  const [isPublic, setIsPublic] = useState(profile?.is_public ?? true);
  const [discoverable, setDiscoverable] = useState(profile?.discoverable ?? false);
  const [remindersOn, setRemindersOn] = useState(!(profile?.reminders_opt_out ?? false));
  const [notifyFollows, setNotifyFollows] = useState(profile?.notify_follows ?? true);
  const [notifyCrowns, setNotifyCrowns] = useState(profile?.notify_crowns ?? true);
  const [notifyReviews, setNotifyReviews] = useState(profile?.notify_reviews ?? true);
  const [notifyEndorsements, setNotifyEndorsements] = useState(profile?.notify_endorsements ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);
  // Defaults to the most private choice: remove everything.
  const [eraseContent, setEraseContent] = useState(true);
  const [deleteErr, setDeleteErr] = useState("");

  const [providers, setProviders] = useState(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState("");

  const [conquests, setConquests] = useState(null);
  const [conquestsError, setConquestsError] = useState("");
  const [blockedUsers, setBlockedUsers] = useState(null);

  useEffect(() => {
    getLinkedProviders().then(setProviders).catch(() => setProviders([]));
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    loadConquestProgress(profile.id).then(setConquests).catch((e) => setConquestsError(e.message || "Couldn't load these."));
    loadBlockedUsers(profile.id).then(setBlockedUsers).catch(() => setBlockedUsers([]));
  }, [profile?.id]);
  const googleLinked = providers?.includes("google");

  const handleUnblock = async (blockedId) => {
    await unblockUser(profile.id, blockedId);
    setBlockedUsers((list) => list.filter((b) => b.id !== blockedId));
  };

  const toggleGoogle = async () => {
    setLinkBusy(true); setLinkErr("");
    try {
      if (googleLinked) {
        await unlinkGoogle();
        setProviders((p) => p.filter((x) => x !== "google"));
      } else {
        await linkGoogle(); // redirects away and back - nothing to update here on success
      }
    } catch (e) {
      setLinkErr(e.message || "Couldn't update that.");
    }
    setLinkBusy(false);
  };

  const usernameValid = /^[a-z0-9-]{3,30}$/.test(username.trim().toLowerCase());
  const deleteConfirmed = deleteText.trim().toLowerCase() === profile?.username?.toLowerCase();

  const save = async () => {
    if (!usernameValid || busy) return;
    setBusy(true); setErr("");
    try {
      await onSubmit({
        username: username.trim().toLowerCase(), display_name: displayName.trim() || null, city: city.trim() || null, is_public: isPublic, discoverable, reminders_opt_out: !remindersOn,
        notify_follows: notifyFollows, notify_crowns: notifyCrowns, notify_reviews: notifyReviews, notify_endorsements: notifyEndorsements,
      });
      onClose();
    } catch (e) {
      setErr(e.message || "Couldn't save. Try again.");
    }
    setBusy(false);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmed || deleting) return;
    setDeleting(true); setDeleteErr("");
    try {
      await onDeleteAccount(eraseContent);
    } catch (e) {
      setDeleteErr(e.message || "Couldn't delete your account. Try again.");
      setDeleting(false);
    }
  };

  return (
    <div data-modal-backdrop className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center" style={{ background: "rgba(10,5,16,0.78)" }} onClick={onClose}>
      <div role="dialog" aria-modal="true" tabIndex={-1} className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between px-5 pt-5 pb-3" style={{ background: C.card, borderBottom: `1px solid ${C.cardEdge}` }}>
          <h3 className="text-lg" style={{ ...display, fontWeight: 700 }}>Your profile</h3>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center" style={{ color: C.muted }}><X size={18} /></button>
        </div>

        <div className="overflow-y-auto px-5 pb-5">
        <div className="mt-3">
          <AvatarPicker userId={profile?.id} url={profile?.avatar_url} onChange={onChangeAvatar} />
        </div>
        <div className="mt-3 text-center">
          <Crown size={30} className="mx-auto" style={{ color: C.goldText }} fill={C.gold} strokeWidth={0} />
          <h2 className="mt-1 text-xl" style={{ ...display, fontWeight: 900 }}>{title}</h2>
          <p className="mt-1 text-sm italic" style={{ color: C.muted }}>
            {profile?.is_owner ? "Nomarchy exists because you built it." : rank.note}
          </p>
          <div className="mt-3 text-4xl" style={{ ...display, fontWeight: 900, color: C.goldText }}>{score}</div>
          <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.14em" }}>Taste credibility</div>
          {nextRank && (<div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: C.bg }}>
              <div className="h-full rounded-full" style={{ background: C.gold, width: `${Math.min(100, ((score - rank.min) / (nextRank.min - rank.min)) * 100)}%` }} />
            </div>
            <p className="mt-1.5 text-xs" style={{ color: C.muted }}>{nextRank.min - score} to {nextRank.title}</p>
          </div>)}
        </div>

        <div className="mt-4">
          <RankLadder score={score} />
        </div>

        <ProfileSection title="Your stats" className="mt-5">
          <div className="grid grid-cols-2 gap-3 text-left">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
                <div className="text-xl" style={{ ...display, fontWeight: 700, color: C.goldText }}>{s.n}</div>
                <div className="text-xs font-semibold">{s.label}</div>
                <div className="mt-0.5 text-xs" style={{ color: C.muted }}>{s.hint}</div>
              </div>))}
          </div>
          <p className="mt-3 text-xs leading-relaxed" style={{ color: C.muted }}>
            Credibility rewards conviction and depth, not hype. Honest write ups about real favourites outrank trendy picks with lazy decrees.
          </p>
        </ProfileSection>

        <ProfileSection
          title="Conquests (one-time achievements)"
          right={conquests ? `${conquests.filter((c) => c.completed).length}/${conquests.length}` : null}
        >
          {!conquests && !conquestsError && <RowSkeleton count={3} />}
          {conquestsError && <p className="text-xs" style={{ color: C.coup }}>{conquestsError}</p>}
          {conquests && conquests.map((c) => (
            <div key={c.key} className="flex items-center gap-2.5 py-1.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: c.completed ? C.gold : C.bg, border: `1px solid ${c.completed ? C.gold : C.cardEdge}` }}>
                {c.completed ? <Check size={13} style={{ color: C.onGold }} /> : <Lock size={11} style={{ color: C.muted }} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold" style={{ color: c.completed ? C.cream : C.muted }}>{c.title}</div>
                <div className="truncate text-xs" style={{ color: C.muted }}>{c.desc}</div>
              </div>
              <span className="shrink-0 text-xs font-bold" style={{ color: c.completed ? C.goldText : C.muted }}>+{c.points}</span>
            </div>
          ))}
        </ProfileSection>

        {a11y && onChangeA11y && (
          <ProfileSection title="Accessibility">
            <p className="text-xs" style={{ color: C.muted }}>Changes apply straight away and are saved to your account.</p>
            <div className="mt-2 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
              <div className="text-sm font-semibold">Reduce motion</div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>Stops spinning, sliding and floating animations.</div>
              <div className="mt-2 flex overflow-hidden rounded-lg" role="radiogroup" aria-label="Reduce motion" style={{ border: `1px solid ${C.cardEdge}` }}>
                {[["system", "Match my phone"], ["on", "On"], ["off", "Off"]].map(([value, label], i) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={a11y.motion === value}
                    onClick={() => onChangeA11y({ motion: value })}
                    className="flex-1 py-1.5 text-xs font-semibold"
                    style={{ background: a11y.motion === value ? C.gold : C.card, color: a11y.motion === value ? C.onGold : C.muted, borderLeft: i > 0 ? `1px solid ${C.cardEdge}` : "none" }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {[
              ["calmCelebrations", "Calmer celebrations", "A short message when you climb a rank, instead of the full-screen celebration."],
              ["largerText", "Larger text", "Makes all text bigger, including the small labels."],
              ["stickyMessages", "Messages stay until dismissed", "Pop-up messages wait for you to close them instead of disappearing."],
            ].map(([key, label, hint]) => (
              <div key={key} className="mt-2 flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
                <div>
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="mt-0.5 text-xs" style={{ color: C.muted }}>{hint}</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={a11y[key]}
                  aria-label={label}
                  onClick={() => onChangeA11y({ [key]: !a11y[key] })}
                  className="relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors"
                  style={{ background: a11y[key] ? C.gold : C.cardEdge }}
                >
                  <span className="absolute left-0 top-0.5 h-5 w-5 rounded-full transition-transform" style={{ background: C.bg, transform: a11y[key] ? "translateX(22px)" : "translateX(2px)" }} />
                </button>
              </div>
            ))}
          </ProfileSection>
        )}

        <ProfileSection title="Settings">
        <div>
          <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Display name</label>
          <input aria-label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="What should we call you?"
            maxLength={40}
            className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
          />
          <div className="mt-1 text-xs" style={{ color: C.muted }}>
            This is the name friends see on your picks, Court, and profile.
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Username</label>
          <input aria-label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="lowercase, letters/numbers/hyphens"
            className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
          />
          <div className="mt-1 text-xs" style={{ color: usernameValid || !username ? C.muted : C.coup }}>
            This is your handle - what friends use to follow you (@{username.trim().toLowerCase() || "username"}) - 3+ characters, lowercase letters, numbers and hyphens only.
          </div>
        </div>

        <div className="mt-3">
          <label className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.12em" }}>Your city</label>
          <input aria-label="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Toronto, Austin, Manchester"
            className="mt-1 w-full rounded-lg px-3 py-2.5 text-sm outline-none"
            style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
          />
          <div className="mt-1 text-xs" style={{ color: C.muted }}>
            Used as the default city when looking up a place - set this if you&apos;re not in Toronto.
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div className="flex items-start gap-2">
            {isPublic ? <Globe size={16} className="mt-0.5 shrink-0" style={{ color: C.goldText }} /> : <Lock size={16} className="mt-0.5 shrink-0" style={{ color: C.muted }} />}
            <div>
              <div className="text-sm font-semibold">{isPublic ? "Public profile" : "Private profile"}</div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>
                {isPublic
                  ? "Anyone with your link can see your kingdom."
                  : "Only you can see your kingdom - this hides it from your link and from friends' Court view too, until you go public again."}
              </div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isPublic}
            onClick={() => setIsPublic((v) => !v)}
            className="relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors"
            style={{ background: isPublic ? C.gold : C.cardEdge }}
          >
            <span
              className="absolute left-0 top-0.5 h-5 w-5 rounded-full transition-transform"
              style={{ background: C.bg, transform: isPublic ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div className="flex items-start gap-2">
            <Search size={16} className="mt-0.5 shrink-0" style={{ color: discoverable ? C.gold : C.muted }} />
            <div>
              <div className="text-sm font-semibold">Discoverable</div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>
                Show up in Find People for anyone to browse and follow - separate from Public/Private above,
                which only controls who can see your kingdom if they already have your link.
              </div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={discoverable}
            onClick={() => setDiscoverable((v) => !v)}
            className="relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors"
            style={{ background: discoverable ? C.gold : C.cardEdge }}
          >
            <span
              className="absolute left-0 top-0.5 h-5 w-5 rounded-full transition-transform"
              style={{ background: C.bg, transform: discoverable ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div className="flex items-start gap-2">
            <Mail size={16} className="mt-0.5 shrink-0" style={{ color: remindersOn ? C.gold : C.muted }} />
            <div>
              <div className="text-sm font-semibold">Inactivity reminders</div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>
                A nudge by email if your kingdom&apos;s been quiet for a month - no sign-in, or nothing new crowned.
              </div>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={remindersOn}
            onClick={() => setRemindersOn((v) => !v)}
            className="relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors"
            style={{ background: remindersOn ? C.gold : C.cardEdge }}
          >
            <span
              className="absolute left-0 top-0.5 h-5 w-5 rounded-full transition-transform"
              style={{ background: C.bg, transform: remindersOn ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>

        <div className="mt-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>Notify me about</div>
          {[
            ["New followers", notifyFollows, setNotifyFollows],
            ["New crowns from Court", notifyCrowns, setNotifyCrowns],
            ["New reviews from Court", notifyReviews, setNotifyReviews],
            ["Endorsements on my picks", notifyEndorsements, setNotifyEndorsements],
          ].map(([label, value, setValue]) => (
            <div key={label} className="mt-2 flex items-center justify-between gap-3">
              <span className="text-sm">{label}</span>
              <button
                type="button"
                role="switch"
                aria-checked={value}
                onClick={() => setValue((v) => !v)}
                className="relative h-5 w-9 shrink-0 overflow-hidden rounded-full transition-colors"
                style={{ background: value ? C.gold : C.cardEdge }}
              >
                <span
                  className="absolute left-0 top-0.5 h-4 w-4 rounded-full transition-transform"
                  style={{ background: C.bg, transform: value ? "translateX(18px)" : "translateX(2px)" }}
                />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div>
            <div className="text-sm font-semibold">Appearance</div>
            <div className="mt-0.5 text-xs" style={{ color: C.muted }}>{theme === "light" ? "Light" : "Dark"} mode</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={theme === "light"}
            onClick={toggleTheme}
            className="relative h-6 w-11 shrink-0 overflow-hidden rounded-full transition-colors"
            style={{ background: theme === "light" ? C.gold : C.cardEdge }}
          >
            <span
              className="absolute left-0 top-0.5 h-5 w-5 rounded-full transition-transform"
              style={{ background: C.bg, transform: theme === "light" ? "translateX(22px)" : "translateX(2px)" }}
            />
          </button>
        </div>

        {onTour && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
            <div>
              <div className="text-sm font-semibold">Take the tour</div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>A quick walkthrough of the app.</div>
            </div>
            <button
              type="button"
              onClick={onTour}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
              style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}
            >
              Start
            </button>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div>
            <div className="text-sm font-semibold">Feedback</div>
            <div className="mt-0.5 text-xs" style={{ color: C.muted }}>Found a bug, or have an idea?</div>
          </div>
          <button
            type="button"
            onClick={onFeedback}
            className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
            style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}
          >
            <MessageSquare size={13} />
            Send
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
          <div className="flex items-center gap-2">
            <GoogleIcon size={18} />
            <div>
              <div className="text-sm font-semibold">Google sign-in</div>
              <div className="mt-0.5 text-xs" style={{ color: C.muted }}>
                {providers === null ? "Checking..." : googleLinked ? "Connected - you can sign in with either method." : "Not connected yet."}
              </div>
            </div>
          </div>
          {providers !== null && (
            <button
              type="button"
              onClick={toggleGoogle}
              disabled={linkBusy}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold"
              style={googleLinked ? { color: C.muted, border: `1px solid ${C.cardEdge}` } : { background: C.gold, color: C.onGold }}
            >
              {linkBusy ? <Loader2 size={13} className="animate-spin" /> : null}
              {googleLinked ? "Unlink" : "Link"}
            </button>
          )}
        </div>
        {linkErr && <p className="mt-1.5 text-xs" style={{ color: C.coup }}>{linkErr}</p>}

        {blockedUsers && blockedUsers.length > 0 && (
          <div className="mt-3 rounded-lg p-3" style={{ background: C.bg, border: `1px solid ${C.cardEdge}` }}>
            <div className="text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>Blocked users</div>
            {blockedUsers.map((b) => (
              <div key={b.id} className="mt-2 flex items-center justify-between gap-2">
                <span className="text-sm">{b.name}</span>
                <button onClick={() => handleUnblock(b.id)} className="text-xs font-semibold" style={{ color: C.goldText }}>Unblock</button>
              </div>
            ))}
          </div>
        )}

        {err && <p className="mt-3 text-xs" style={{ color: C.coup }}>{err}</p>}

        <button
          disabled={!usernameValid || busy}
          onClick={save}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold"
          style={usernameValid ? { background: C.gold, color: C.onGold } : { background: C.cardEdge, color: C.muted }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          Save
        </button>

        <div className="mt-6 rounded-lg p-3" style={{ border: `1px solid ${C.coup}55` }}>
          {!confirmingDelete ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold"
              style={{ color: C.coup }}
            >
              <Trash2 size={13} /> Delete my account
            </button>
          ) : (
            <div>
              <p className="text-xs leading-relaxed" style={{ color: C.coup }}>
                This closes your account for good - you&apos;ll be signed out, your name and Next in Line are removed, and you&apos;re unfollowed everywhere. It cannot be undone. Choose what happens to your crowns and reviews:
              </p>
              <div className="mt-2 space-y-1.5" role="radiogroup" aria-label="What happens to your crowns and reviews">
                {[
                  [true, "Delete everything", "Your crowns, past crowns, reviews and photos are removed too."],
                  [false, "Keep my crowns and reviews up", "They stay up for others, credited to \u201cNo longer a user\u201d instead of you."],
                ].map(([value, label, hint]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={eraseContent === value}
                    onClick={() => setEraseContent(value)}
                    className="flex w-full items-start gap-2 rounded-lg p-2.5 text-left"
                    style={{ background: C.bg, border: `1px solid ${eraseContent === value ? C.coup : C.cardEdge}` }}
                  >
                    <span className="mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full" style={{ border: `1.5px solid ${eraseContent === value ? C.coup : C.muted}` }}>
                      {eraseContent === value && <span className="h-1.5 w-1.5 rounded-full" style={{ background: C.coup }} />}
                    </span>
                    <span>
                      <span className="block text-xs font-bold" style={{ color: C.cream }}>{label}</span>
                      <span className="block text-xs" style={{ color: C.muted }}>{hint}</span>
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs" style={{ color: C.muted }}>
                Type <span style={{ color: C.cream, fontWeight: 700 }}>{profile?.username}</span> to confirm.
              </p>
              <input aria-label="Type your username to confirm"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
              />
              {deleteErr && <p className="mt-1.5 text-xs" style={{ color: C.coup }}>{deleteErr}</p>}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => { setConfirmingDelete(false); setDeleteText(""); setDeleteErr(""); }}
                  className="flex-1 rounded-lg py-2 text-xs font-bold"
                  style={{ border: `1px solid ${C.cardEdge}`, color: C.muted }}
                >
                  Cancel
                </button>
                <button
                  disabled={!deleteConfirmed || deleting}
                  onClick={confirmDelete}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold"
                  style={deleteConfirmed ? { background: C.coup, color: C.onCoup } : { background: C.cardEdge, color: C.muted }}
                >
                  {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  Delete my account
                </button>
              </div>
            </div>
          )}
        </div>
        </ProfileSection>

        <Link href="/faq" className="mt-4 block text-center text-xs font-semibold" style={{ color: C.muted }}>
          How Nomarchy works
        </Link>

        <a
          href="https://www.instagram.com/nomarchyapp"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center justify-center gap-1.5 text-xs font-semibold"
          style={{ color: C.muted }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
          Follow @nomarchyapp
        </a>
        </div>
      </div>
    </div>
  );
}
