"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ChevronDown, Sun, Moon } from "lucide-react";
import { C, display, LogoMark, FontShell, useTheme } from "../theme";

// Split out from page.js so that file can stay a server component (needed
// for its metadata export) while this part, which needs to respond to the
// light/dark toggle, runs as a client component - see [username]/page.js
// for the same pattern.
//
// Real questions, not topic headers ("Kingdom - crowning a place" became
// "How do I crown a restaurant?") - a long page of labelled sections reads
// like documentation nobody opens; a list of the actual questions someone
// would type into a search bar is what gets scanned and tapped into. Each
// question opens independently (not one-at-a-time) so skimming several
// answers at once never fights the page.
const QUESTIONS = [
  {
    q: "What is Nomarchy?",
    a: (
      <p>
        A place to keep one real favourite per cuisine - your <strong>Kingdom</strong>. Not a list of everywhere
        decent you&apos;ve tried, just the one place you&apos;d actually send a friend for pizza, for ramen, for
        tacos. When somewhere better comes along, you dethrone the old one - that&apos;s a <strong>coup</strong>.
      </p>
    ),
  },
  {
    id: "royal-words",
    q: "What do the royal words mean?",
    a: (
      <ul className="list-disc space-y-1 pl-5">
        <li><strong>Kingdom</strong> - your favourite restaurant for each cuisine.</li>
        <li><strong>Throne / Crown</strong> - your one favourite in a cuisine, and choosing it.</li>
        <li><strong>Decree</strong> - your short review of why it&apos;s your favourite.</li>
        <li><strong>Coup / Dethrone</strong> - replacing a favourite with a better place. The old one goes to your history.</li>
        <li><strong>Next in Line</strong> - places you want to try.</li>
        <li><strong>Privy Council</strong> - a suggestion when you can&apos;t decide, from your list and your friends&apos; picks.</li>
        <li><strong>Court</strong> - the friends you follow.</li>
        <li><strong>Endorse</strong> - agreeing with a friend&apos;s pick, like a thumbs-up.</li>
        <li><strong>Best in the Land</strong> - the restaurants most people have picked as a favourite.</li>
        <li><strong>Conquests</strong> - one-time achievements.</li>
        <li><strong>Ranks</strong> - your level, from Peckish Peasant up to Monarch of Taste, which rises as you use the app.</li>
      </ul>
    ),
  },
  {
    q: "How do I crown a restaurant?",
    a: (
      <p>
        Pick a cuisine, pick a real place, and write a short decree explaining why it earned the throne (at
        least 30 characters - long enough to actually say something, not just &ldquo;good food&rdquo;). Each
        cuisine holds exactly one throne at a time. Crowning a new place in an already-occupied cuisine is a
        coup - the old monarch gets archived, not deleted, so your history of past favourites is never lost.
      </p>
    ),
  },
  {
    q: "Is there a tour of the app?",
    a: (
      <p>
        Yes - new accounts get a short walkthrough the first time they sign in, with arrows pointing out
        where everything is. You can skip it any time, and replay it whenever you like: tap your name at the
        top, open <strong>Settings</strong>, and choose <strong>Take the tour</strong>.
      </p>
    ),
  },
  {
    q: "How does searching for a restaurant work?",
    a: (
      <p>
        Type a name (and a city, if it&apos;s not your own) and the search is powered by Google, so it finds
        almost any restaurant, anywhere. When you add a place to Next in Line, we&apos;ll also suggest a
        cuisine based on what Google knows about it - it&apos;s only a suggestion, so you can change it to
        whatever you like. Photos, Share and Edit all live on the throne card itself: Share is the small icon
        in the corner, and to remove a photo, open <strong>Edit</strong> and tap the small x on it.
      </p>
    ),
  },
  {
    q: "Can I add my own cuisine?",
    a: (
      <p>
        Yes - at the bottom of your Kingdom, tap <strong>Add a cuisine</strong>, name it, and pick an icon
        for it (tap the plate). That icon is what shows on its map pins, for you and for friends who see it.
        You can change the icon later by tapping it on that cuisine&apos;s throne.
      </p>
    ),
  },
  {
    q: "What's Next in Line for?",
    a: (
      <p>
        Places you keep meaning to try, or have been to but aren&apos;t ready to crown. Mark one as
        &ldquo;been&rdquo; to leave a note and tag it <strong>Worth it</strong> or <strong>Not for me</strong> -
        visible to people who follow you once you have. This is meant to stay a quick personal take, not a
        public rating system - there&apos;s no star scores or public rankings of a place.
      </p>
    ),
  },
  {
    q: "What's the Privy Council?",
    a: (
      <p>
        The &ldquo;can&apos;t decide what to eat&rdquo; card at the top of Next in Line. Filter by cuisine and
        it suggests one place - pulled from what your Court has crowned or tried, and from your own
        unvisited Next in Line, all narrowed to your city. Tap <strong>Show me another</strong> to re-roll, or
        <strong> Add to my list</strong> to save a friend&apos;s pick to your own.
      </p>
    ),
  },
  {
    q: "Can I import a list I already keep somewhere else?",
    a: (
      <p>
        Yes - paste the whole thing (Notes, a spreadsheet, anything) into Next in Line&apos;s <strong>Import a
        list</strong>, and it&apos;ll sort out the names, cuisines, and notes for you. No need to add them one
        at a time.
      </p>
    ),
  },
  {
    q: "What does the Map show?",
    a: (
      <p>
        Everything with a known location - gold-ringed pins for places you&apos;ve been (crowned or just
        visited), blue for what&apos;s still on the list, each one showing an emoji for its cuisine so you can
        tell what&apos;s what at a glance. Handy if you&apos;re heading somewhere and want to see what&apos;s
        nearby. The cuisine filter narrows both views down to just what you&apos;re in the mood for.
      </p>
    ),
  },
  {
    q: "How does following friends (Court) work?",
    a: (
      <p>
        Follow people by username to see their kingdoms and endorse picks you agree with. Endorsements feed
        into their credibility score, alongside how many thrones they hold, how many coups they&apos;ve
        staged, how much thought goes into their decrees, and whether they bothered to add photos - it&apos;s
        meant to reward genuine taste, not just volume. In your Court list, the three highest scores (ties share
        a place) get a gold, silver or bronze crown, and you can switch between an Expanded and a Compact view.
        Your Court tab shows how many people you follow and how many follow you, and each friend&apos;s
        profile shows their follower count. Open a friend and, once they have at least two places in a cuisine, you&apos;ll see what they&apos;re
        &ldquo;Known for&rdquo; - worked out automatically from their crowns and the places they&apos;ve been.
        When someone in your Court crowns or tries somewhere new, you&apos;ll get a notification - tap it to
        jump straight to that pick in their kingdom.
      </p>
    ),
  },
  {
    q: "What are Conquests?",
    a: (
      <p>
        One-time achievements for things like crowning your first place, holding two different cuisines, or
        filling every slot in your Kingdom - open the <strong>Conquests</strong> section of Your Profile to see the
        full checklist, and how much each is worth. Each one only ever pays out once.
      </p>
    ),
  },
  {
    q: "What do the crown badges and ranks mean?",
    a: (
      <p>
        That filled-in crown next to a name is your rank, climbing from Peckish Peasant up through titles like
        Baron, Viscount, and Earl, all the way to Monarch of Taste. It&apos;s driven by your score - crowns,
        coups, decrees, endorsements, and Conquests all feed it. Cross into a new tier and you&apos;ll get a
        full-screen (deliberately over-the-top) proclamation to celebrate it, with a share card to go with it.
      </p>
    ),
  },
  {
    q: "What's Best in the Land?",
    a: (
      <p>
        The most-crowned restaurants across everyone&apos;s public kingdoms, filterable by time range and
        location - or toggle it down to just your own Court. A quick way to see what&apos;s actually earning
        thrones right now, not just among your friends.
      </p>
    ),
  },
  {
    q: "What does \u201cPermanently closed\u201d mean?",
    a: (
      <p>
        When a restaurant is confirmed to have permanently closed, it&apos;s marked as such. If it was
        one of your crowns, it stays on your throne with a &ldquo;Permanently closed&rdquo; label so you can
        decide when to pick a new favourite - nothing is removed for you. A closed place on your Next in
        Line is greyed out. Closed places no longer appear on the maps, in Best in the Land, or in Privy
        Council suggestions, and can&apos;t be added again. You&apos;ll get a notification when one of
        yours is marked. If you think it&apos;s wrong, use the &ldquo;report it here&rdquo; link in that
        notification, or send Feedback from Your Profile.
      </p>
    ),
  },
  {
    q: "Can I make Nomarchy easier to use?",
    a: (
      <p>
        Yes - tap your name at the top and open <strong>Accessibility</strong>. You can reduce motion (or match
        your phone&apos;s setting), swap the full-screen rank celebration for a short message, make all text
        larger, and keep pop-up messages on screen until you close them. Your choices are saved to your account,
        so they follow you to any device. Nomarchy also works with a keyboard and with screen readers.
      </p>
    ),
  },
  {
    q: "What's the difference between Public, Private, and Discoverable?",
    a: (
      <>
        <p>These are two separate switches in Your Profile - open the <strong>Settings</strong> section - and it&apos;s easy to mix them up:</p>
        <ul className="mt-2 list-disc pl-5">
          <li><strong>Public / Private</strong> controls whether people who already have your profile link (or already follow you) can actually see your kingdom. Private hides it from everyone but you, even friends in Court.</li>
          <li><strong>Discoverable</strong> is separate and off by default - it controls whether strangers can find you at all, by browsing <strong>Find People</strong>. Being &ldquo;Public&rdquo; does not make you Discoverable; they&apos;re independent settings, on purpose.</li>
        </ul>
        <p className="mt-2">Most people only need Public/Private. Discoverable is really for anyone happy to be found by people they don&apos;t already know.</p>
      </>
    ),
  },
  {
    q: "Can I share my profile with people who don't have the app?",
    a: (
      <p>
        Yes - your public profile link (nomarchy.ca/yourusername) works for anyone, signed in or not, as long
        as you&apos;re Public. Shared links also look good when posted to Instagram or other apps.
      </p>
    ),
  },
  {
    q: "Can I install this like a real app?",
    a: (
      <p>
        Yes, and it works best that way. On iPhone: open it in Safari, tap the Share icon, then &ldquo;Add to
        Home Screen&rdquo;. On Android: open it in Chrome, tap the &#8942; menu, then &ldquo;Add to Home
        screen&rdquo; (or &ldquo;Install app&rdquo;).
      </p>
    ),
  },
  {
    q: "How do I delete my account?",
    a: (
      <p>
        Your Profile has a &ldquo;Delete my account&rdquo; option at the bottom of Settings - it&apos;s
        permanent. You choose what happens to your crowns and reviews: delete everything (crowns, past
        crowns, reviews and photos included), or keep them up for others, credited to &ldquo;No longer a
        user&rdquo; instead of your name. Either way, your name, email, Next in Line and follows are removed.
      </p>
    ),
  },
  {
    q: "Found a bug, or have an idea?",
    a: (
      <p>
        Open <strong>Your Profile</strong>, expand <strong>Settings</strong>, and tap <strong>Send</strong> next to Feedback, or just reply to
        any Nomarchy email.
      </p>
    ),
  },
];

export default function FaqContent() {
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(() => new Set());

  // A link like /faq#royal-words opens that answer and scrolls to it.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    const i = QUESTIONS.findIndex((item) => item.id && item.id === id);
    if (i === -1) return;
    setOpen(new Set([i]));
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, []);

  const toggle = (i) => {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  return (
    <FontShell>
      {/* Same max-w-5xl/py-6 shell as the landing page's nav (app/page.js,
          SignInScreen) - a narrower or more-padded container here made the
          logo and toggle visibly jump position when navigating between
          the two pages. */}
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-6">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark size={26} />
          <span className="text-lg tracking-[0.1em]" style={{ ...display, fontWeight: 900 }}>NOMARCHY</span>
        </Link>
        {/* Same right-side cluster as the landing nav (FAQ link, toggle,
            "Open the app") so the toggle itself sits at the same x
            position on both pages - a lone toggle here, with nothing
            to its right, sat flush against the edge instead of where
            it sits on the landing page. */}
        <div className="flex items-center gap-4">
          <Link href="/faq" className="hidden text-sm font-semibold sm:inline" style={{ color: C.goldText }}>FAQ</Link>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ color: C.muted, border: `1px solid ${C.cardEdge}` }}
          >
            {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
          </button>
          <Link href="/#sign-in" className="rounded-full px-4 py-2 text-xs font-bold sm:text-sm" style={{ background: C.gold, color: C.onGold }}>Open the app</Link>
        </div>
      </nav>

      <div className="mx-auto max-w-2xl px-5 pb-10 pt-2">
        <h1 className="text-2xl" style={{ ...display, fontWeight: 800 }}>How Nomarchy works</h1>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>Tap a question to open it.</p>

        <div className="mt-6">
          {QUESTIONS.map((item, i) => (
            <FaqItem key={item.q} id={item.id} question={item.q} isOpen={open.has(i)} onToggle={() => toggle(i)}>
              {item.a}
            </FaqItem>
          ))}
        </div>

        <p className="mt-10 text-center text-xs" style={{ color: C.muted }}>
          <Link href="/" style={{ color: C.goldText }}>Back to Nomarchy</Link>
          {" · "}
          <Link href="/terms" style={{ color: C.goldText }}>Terms</Link>
          {" · "}
          <Link href="/privacy" style={{ color: C.goldText }}>Privacy Policy</Link>
          {" · "}
          <a href="https://www.instagram.com/nomarchyapp" target="_blank" rel="noopener noreferrer" style={{ color: C.goldText }}>Instagram</a>
        </p>
      </div>
    </FontShell>
  );
}

function FaqItem({ id, question, isOpen, onToggle, children }) {
  return (
    <div id={id} className="mb-2 scroll-mt-4 overflow-hidden rounded-xl" style={{ background: C.card, border: `1px solid ${C.cardEdge}` }}>
      <button
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-sm font-bold"
        style={{ ...display, color: C.cream }}
      >
        {question}
        <ChevronDown size={16} className="shrink-0 transition-transform" style={{ color: C.goldText, transform: isOpen ? "rotate(180deg)" : "none" }} />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
          {children}
        </div>
      )}
    </div>
  );
}
