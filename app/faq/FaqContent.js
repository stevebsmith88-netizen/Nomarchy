"use client";

import Link from "next/link";
import { C, display, LogoMark, FontShell, useTheme } from "../theme";

// Split out from page.js so that file can stay a server component (needed
// for its metadata export) while this part, which needs to respond to the
// light/dark toggle, runs as a client component - see [username]/page.js
// for the same pattern.
export default function FaqContent() {
  useTheme();
  return (
    <FontShell>
      <div className="mx-auto max-w-2xl px-5 py-10">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark size={26} />
          <span className="text-lg tracking-[0.1em]" style={{ ...display, fontWeight: 900 }}>NOMARCHY</span>
        </Link>

        <h1 className="mt-8 text-2xl" style={{ ...display, fontWeight: 800 }}>How Nomarchy works</h1>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>The short version of everything.</p>

        <Section title="The basic idea">
          Nomarchy is a place to keep one real favourite per cuisine - your <strong>Kingdom</strong>. Not a
          list of everywhere decent you&apos;ve tried, just the one place you&apos;d actually send a friend
          for pizza, for ramen, for tacos. When somewhere better comes along, you dethrone the old one - that&apos;s
          a <strong>coup</strong>.
        </Section>

        <Section title="Kingdom - crowning a place">
          <p className="text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
            Pick a cuisine, pick a real place, and write a short decree explaining why it earned the throne
            (at least 30 characters - long enough to actually say something, not just &ldquo;good food&rdquo;).
            Each cuisine holds exactly one throne at a time. Crowning a new place in an already-occupied
            cuisine is a coup - the old monarch gets archived, not deleted, so your history of past favourites
            is never lost.
          </p>
        </Section>

        <Section title="Next in Line - your shortlist">
          <p className="text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
            Places you keep meaning to try, or have been to but aren&apos;t ready to crown. Mark one as
            &ldquo;been&rdquo; to leave a note and tag it <strong>Worth it</strong> or <strong>Not for me</strong> -
            visible to people who follow you once you have. This is meant to stay a quick personal take, not a
            public rating system - there&apos;s no star scores or public rankings of a place. Already keep
            a list somewhere else (Notes, a spreadsheet)? Paste the whole thing into <strong>Import a list</strong> and
            it&apos;ll sort out the names, cuisines, and notes for you - no need to add them one at a time.
          </p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
            The <strong>Map</strong> view shows everything with a known location - gold pins for places
            you&apos;ve been (crowned or just visited), blue for what&apos;s still on the list. Handy if
            you&apos;re heading somewhere and want to see what&apos;s nearby. The cuisine filter narrows both
            views down to just what you&apos;re in the mood for.
          </p>
        </Section>

        <Section title="Court - following friends">
          <p className="text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
            Follow people by username to see their kingdoms and endorse picks you agree with. Endorsements
            feed into their credibility score, alongside how many thrones they hold, how many coups
            they&apos;ve staged, and how much thought goes into their decrees - it&apos;s meant to reward
            genuine taste, not just volume.
          </p>
        </Section>

        <Section title="Trending">
          The most-crowned restaurants across everyone&apos;s public kingdoms, filterable by time range and
          location. A quick way to see what&apos;s actually earning thrones across the whole Court right now.
        </Section>

        <Section title="Public, Private, and Discoverable - the confusing bit">
          <p className="text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
            These are two separate switches in Your Profile, and it&apos;s easy to mix them up:
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
            <li><strong>Public / Private</strong> controls whether people who already have your profile link (or already follow you) can actually see your kingdom. Private hides it from everyone but you, even friends in Court.</li>
            <li><strong>Discoverable</strong> is separate and off by default - it controls whether strangers can find you at all, by browsing <strong>Find People</strong>. Being &ldquo;Public&rdquo; does not make you Discoverable; they&apos;re independent settings, on purpose.</li>
          </ul>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
            Most people only need Public/Private. Discoverable is really for anyone happy to be found by
            people they don&apos;t already know.
          </p>
        </Section>

        <Section title="Sharing your kingdom">
          Your public profile link (nomarchy.ca/yourusername) works for anyone, signed in or not, as long as
          you&apos;re Public. Shared links also look good when posted to Instagram or other apps.
        </Section>

        <Section title="Add it to your home screen">
          Nomarchy works best added to your home screen like an app. On iPhone: open it in Safari, tap the
          Share icon, then &ldquo;Add to Home Screen&rdquo;. On Android: open it in Chrome, tap the ⋮ menu,
          then &ldquo;Add to Home screen&rdquo; (or &ldquo;Install app&rdquo;).
        </Section>

        <Section title="Deleting your account">
          Your Profile has a &ldquo;Delete my account&rdquo; option at the bottom - it&apos;s permanent and
          removes everything tied to your account (crowns, reviews, follows, everything) with nothing left
          behind.
        </Section>

        <Section title="Found a bug, or have an idea?">
          Use the <strong>Feedback</strong> button at the top of the app, or just reply to any Nomarchy email -
          both come straight to the person building this.
        </Section>

        <p className="mt-10 text-center text-xs" style={{ color: C.muted }}>
          <Link href="/" style={{ color: C.gold }}>Back to Nomarchy</Link>
          {" · "}
          <Link href="/terms" style={{ color: C.gold }}>Terms</Link>
          {" · "}
          <Link href="/privacy" style={{ color: C.gold }}>Privacy Policy</Link>
          {" · "}
          <a href="https://www.instagram.com/nomarchyapp" target="_blank" rel="noopener noreferrer" style={{ color: C.gold }}>Instagram</a>
        </p>
      </div>
    </FontShell>
  );
}

function Section({ title, children }) {
  return (
    <div className="mt-6">
      <h2 className="text-sm font-bold uppercase" style={{ color: C.gold, letterSpacing: "0.1em" }}>{title}</h2>
      <div className="mt-2 text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>{children}</div>
    </div>
  );
}
