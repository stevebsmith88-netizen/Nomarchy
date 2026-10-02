"use client";

import { useState } from "react";
import Link from "next/link";
import { C, FontShell, LogoMark, display, useTheme } from "../theme";
import { GoogleIcon } from "./shared";
import { signIn, signInWithGoogle, verifyCode } from "@/lib/data";
import { Check, Crown, Loader2, Moon, Sun } from "lucide-react";

// Illustrative only - no real user's data. Cold traffic (a stranger from
// Instagram, say) has nothing to judge the product by otherwise; a made-up
// but concrete-looking kingdom does more work than another sentence of
// description, without needing an actual account's screenshots.
// Cuisine labels here must match real seeded categories (see schema.sql's
// cuisines insert) - "Ramen" and "Tacos" alone aren't real ones (they're
// "Japanese and Ramen" and "Mexican"), and showing the wrong taxonomy on
// the one page meant to represent the app honestly defeats the point.
export const EXAMPLE_THRONES = [
  { cuisine: "PIZZA", name: "Pizzeria Libretto", note: "Best margherita in the city, hands down." },
  { cuisine: "JAPANESE AND RAMEN", name: "Sakura House", note: "Rich tonkotsu broth that never misses." },
  { cuisine: "MEXICAN", name: "El Fuego", note: "Al pastor that ruined every other taco for me." },
];

export function SignInScreen() {
  const { theme, toggleTheme } = useTheme();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  const handleGoogle = async () => {
    setError(""); setGoogleBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err.message);
      setGoogleBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSubmitting(true);
    try {
      await signIn(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    }
    setSubmitting(false);
  };

  // Typing the code in keeps you inside this same window the whole time -
  // no hop out to Safari and back, which is what breaks a home-screen PWA.
  const handleVerify = async (e) => {
    e.preventDefault();
    setError(""); setVerifying(true);
    try {
      await verifyCode(email, code.trim());
    } catch (err) {
      setError(err.message);
    }
    setVerifying(false);
  };

  return (
    <FontShell>
      {/* NAV - logo size/type must match the FAQ page's header exactly
          (26px, text-lg) or it visibly resizes when navigating between
          the two, which is what was happening before. */}
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-2">
          <LogoMark size={26} />
          <span className="text-lg tracking-[0.1em]" style={{ ...display, fontWeight: 900 }}>NOMARCHY</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/faq" className="hidden text-sm font-semibold sm:inline" style={{ color: C.muted }}>FAQ</Link>
          {/* Minimal sun/moon toggle, not the full labelled switch used in
              Settings - this is a quick "see it both ways" preview for a
              visitor who hasn't signed up yet, not a persisted setting
              they need a dedicated row for. Shows the icon for what
              tapping it switches TO, same convention as everywhere else
              a theme toggle shows up. */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}
          >
            {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          <a href="#sign-in" className="whitespace-nowrap rounded-full px-4 py-2 text-xs font-bold sm:text-sm" style={{ background: C.gold, color: C.onGold }}>Open the app</a>
        </div>
      </nav>

      {/* HERO */}
      <div className="relative mx-auto max-w-2xl px-5 pb-4 pt-6 text-center sm:pt-10">
        {/* A single floating row, not scattered around the text - felt
            too close to a certain reference image otherwise. */}
        <div aria-hidden className="mb-4 flex items-center justify-center gap-3 text-2xl sm:gap-4 sm:text-3xl">
          <span style={{ "--r": "-8deg", animation: "nomarchy-float 5s ease-in-out infinite" }}>👑</span>
          <span style={{ "--r": "6deg", animation: "nomarchy-float 5.6s ease-in-out infinite 0.3s" }}>🍕</span>
          <span style={{ "--r": "-5deg", animation: "nomarchy-float 6.2s ease-in-out infinite 0.6s" }}>🍜</span>
          <span style={{ "--r": "7deg", animation: "nomarchy-float 5.8s ease-in-out infinite 0.9s" }}>🍷</span>
          <span style={{ "--r": "-6deg", animation: "nomarchy-float 6.6s ease-in-out infinite 1.2s" }}>🥐</span>
        </div>

        <div className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase" style={{ background: C.card, color: C.goldText, letterSpacing: "0.1em", border: `1px solid ${C.cardEdge}` }}>
          Toronto Beta
        </div>
        <h1 className="text-3xl leading-[1.15] sm:text-5xl" style={{ ...display, fontWeight: 900 }}>
          Crown your favourites.<br />Settle every debate.
        </h1>
        <p className="mt-2 text-sm italic" style={{ ...display, color: C.muted }}>Long live your favourites.</p>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed" style={{ color: C.muted }}>
          One throne per cuisine. When something better comes along, stage a coup. Compare kingdoms with friends, and climb the ranks as your picks earn trust.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
          <a href="#sign-in" className="rounded-full px-6 py-3 text-sm font-bold" style={{ background: C.gold, color: C.onGold }}>Sign up &mdash; it&apos;s free</a>
          <a href="#preview" className="rounded-full px-6 py-3 text-sm font-bold" style={{ border: `1px solid ${C.cardEdge}`, color: C.cream }}>See how it works</a>
        </div>
        <p className="mt-3 text-xs" style={{ color: C.muted }}>Free to use &middot; Toronto beta &middot; No ads, ever</p>
      </div>

      {/* PREVIEW - illustrative only, not a real account's data (see
          EXAMPLE_THRONES's own comment) */}
      <div id="preview" className="scroll-mt-10 px-5 pb-10 pt-4">
        <PhonePreview />
      </div>

      <div className="flex min-h-screen flex-col items-center px-5 pb-10 pt-6">
        <div id="sign-in" className="w-full max-w-sm scroll-mt-10 rounded-2xl p-7 text-center" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
          <div className="flex items-center justify-center gap-2">
            <LogoMark size={28} />
            <h2 className="text-2xl tracking-[0.12em]" style={{ ...display, fontWeight: 900 }}>NOMARCHY</h2>
          </div>
          <p className={`mt-1 text-sm italic ${sent ? "mb-6" : ""}`} style={{ ...display, color: C.muted }}>Long live your favourites.</p>

          {!sent && (
            <p className="mb-6 mt-3 text-xs leading-relaxed" style={{ color: C.muted }}>
              Already keep a list of favourites? Paste the whole thing in once you&apos;re signed in and we&apos;ll sort it out.
            </p>
          )}

          {sent ? (
            <form onSubmit={handleVerify} className="flex flex-col gap-3">
              <p className="text-sm" style={{ color: C.muted }}>
                Check your email for a sign-in code and type it in below. (There&apos;s also a link in that email if you&apos;d rather tap that on a computer.)
              </p>
              <input aria-label="Sign-in code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-center text-lg tracking-[0.3em] outline-none"
                style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
              />
              {error && <p className="text-xs" style={{ color: C.coup }}>{error}</p>}
              <button type="submit" disabled={verifying} className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold" style={{ background: C.gold, color: C.onGold }}>
                {verifying ? <Loader2 size={15} className="animate-spin" /> : <Crown size={15} />}
                {verifying ? "Verifying..." : "Verify and sign in"}
              </button>
              <button
                type="button"
                onClick={() => { setSent(false); setCode(""); setError(""); }}
                className="text-xs font-semibold"
                style={{ color: C.muted }}
              >
                Use a different email
              </button>
            </form>
          ) : (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleGoogle}
                disabled={googleBusy}
                className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold"
                style={{ background: C.gold, color: C.onGold }}
              >
                {googleBusy ? <Loader2 size={15} className="animate-spin" /> : <GoogleIcon size={16} />}
                {googleBusy ? "Redirecting..." : "Continue with Google"}
              </button>

              <div className="flex items-center gap-2">
                <div className="h-px flex-1" style={{ background: C.cardEdge }} />
                <span className="text-xs" style={{ color: C.muted }}>or</span>
                <div className="h-px flex-1" style={{ background: C.cardEdge }} />
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <input aria-label="Email address"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: C.bg, border: `1px solid ${C.cardEdge}`, color: C.cream }}
                />
                {error && <p className="text-xs" style={{ color: C.coup }}>{error}</p>}
                <button type="submit" disabled={submitting} className="flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold" style={{ background: "transparent", color: C.cream, border: `1px solid ${C.cardEdge}` }}>
                  {submitting ? <Loader2 size={15} className="animate-spin" /> : <Crown size={15} />}
                  {submitting ? "Sending..." : "Send sign-in code"}
                </button>
              </form>
            </div>
          )}
          <p className="mt-5 text-center text-xs" style={{ color: C.muted }}>
            By continuing, you agree to our{" "}
            <Link href="/terms" style={{ color: C.muted, textDecoration: "underline" }}>Terms</Link> and{" "}
            <Link href="/privacy" style={{ color: C.muted, textDecoration: "underline" }}>Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </FontShell>
  );
}

// A plain CSS phone frame, not a screenshot - no real account's data to
// show yet (see EXAMPLE_THRONES's own comment above), so this wraps the
// same illustrative kingdom/coup cards that lived flat on the page
// before, just presented the way a visitor actually expects to picture
// using this on their own phone. Swap in a real screenshot here later if
// one looks better than the mocked-up cards.
export function PhonePreview() {
  return (
    <div className="mx-auto" style={{ width: 300, maxWidth: "100%" }}>
      <p className="mb-4 text-center text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.14em" }}>See it in action</p>
      <div className="rounded-[2.5rem] p-3" style={{ background: "#0C0712", boxShadow: "0 30px 60px rgba(0,0,0,0.45)" }}>
        <div className="relative overflow-hidden rounded-[2rem] px-4 pb-5 pt-9" style={{ background: C.bg, minHeight: 540 }}>
          <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full" style={{ background: "#0C0712" }} />

          <div className="mb-4 flex items-center justify-center gap-1.5">
            <LogoMark size={16} />
            <span className="text-xs tracking-[0.1em]" style={{ ...display, fontWeight: 900, color: C.cream }}>NOMARCHY</span>
          </div>

          <p className="mb-2 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>Your kingdom</p>
          <div className="flex flex-col gap-2">
            {EXAMPLE_THRONES.map((t) => (
              <div key={t.cuisine} className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.gold}55` }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>{t.cuisine}</span>
                  <Crown size={12} style={{ color: C.goldText }} fill={C.gold} strokeWidth={0} />
                </div>
                <p className="mt-1 text-sm" style={{ ...display, fontWeight: 700, color: C.cream }}>{t.name}</p>
                <p className="mt-0.5 text-xs italic leading-snug" style={{ color: C.muted }}>&ldquo;{t.note}&rdquo;</p>
              </div>
            ))}
          </div>

          <p className="mb-2 mt-4 text-xs font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>A coup in progress</p>
          <div className="rounded-xl p-3" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
            <div className="flex items-center justify-between opacity-60">
              <div>
                <span className="text-[10px] font-bold uppercase" style={{ color: C.muted, letterSpacing: "0.1em" }}>Reigning &mdash; Pizza</span>
                <p className="text-sm" style={{ ...display, fontWeight: 700, color: C.cream, textDecoration: "line-through" }}>Mario&rsquo;s Pizzeria</p>
              </div>
              <Crown size={15} style={{ color: C.muted }} />
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase" style={{ color: C.goldText, letterSpacing: "0.1em" }}>Challenger</span>
                <p className="text-sm" style={{ ...display, fontWeight: 700, color: C.cream }}>Pizzeria Libretto</p>
              </div>
              <span className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold" style={{ background: C.gold, color: C.onGold }}>
                <Crown size={12} /> Crown it
              </span>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-[11px] italic" style={{ color: C.muted }}>
        Example kingdom shown &mdash; yours starts empty, waiting for your first pick.
      </p>
      {/* The nav's own FAQ link is hidden on narrow phones to keep that
          row from crowding - this is the mobile equivalent, placed right
          where someone who just watched the preview would look for "ok,
          how does this actually work". */}
      <p className="mt-3 text-center text-xs sm:hidden">
        <Link href="/faq" className="font-semibold underline" style={{ color: C.muted }}>Read the FAQ</Link>
      </p>
    </div>
  );
}
