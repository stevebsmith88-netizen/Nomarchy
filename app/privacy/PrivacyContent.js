"use client";

import Link from "next/link";
import { C, display, LogoMark, FontShell, useTheme } from "../theme";

// Split out from page.js so that file can stay a server component (needed
// for its metadata export) while this part, which needs to respond to the
// light/dark toggle, runs as a client component - see [username]/page.js
// for the same pattern.
export default function PrivacyContent() {
  useTheme();
  return (
    <FontShell>
      <div className="mx-auto max-w-2xl px-5 py-10">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark size={26} />
          <span className="text-lg tracking-[0.1em]" style={{ ...display, fontWeight: 900 }}>NOMARCHY</span>
        </Link>

        <h1 className="mt-8 text-2xl" style={{ ...display, fontWeight: 800 }}>Privacy Policy</h1>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>Last updated: October 2026</p>

        <Section title="What this is">
          Nomarchy is a small app for tracking and comparing your favourite restaurants with friends. This
          page explains what information it collects, why, and what you can do about it.
        </Section>

        <Section title="Information we collect">
          <List items={[
            "Account info: your email address (or your Google account info, if you sign in with Google), and a username you choose.",
            "Profile info: display name, city, and a profile photo, if you add them.",
            "Content you create: restaurants you crown or add to your list (along with the place's Google ID and map coordinates, so we can show it on a map), written reviews (“decrees”), ratings, and photos you attach.",
            "Social info: who you follow and who follows you.",
            "Feedback you submit through the in-app feedback form, including your device/browser type (captured automatically so bug reports are easier to act on).",
            "Basic usage data needed to run the app - e.g. when you signed up, when a review was posted, and a simple count of how many restaurant searches and map views are made (linked to your account), so we can keep an eye on running costs.",
            "Error reports: if something breaks, the app sends us a short technical report - what went wrong, on which page, and your browser type - so we can fix it. It isn't linked to your account, and we delete it after 90 days.",
            "Where you came from: if you arrive through a tagged link (for example, one on our Instagram), we note which link it was and save it once, when you sign up, to understand how people find Nomarchy. It is only visible to us, and the tag is held in your browser until you sign up.",
          ]} />
        </Section>

        <Section title="How we use it">
          <List items={[
            "To run the app: show your kingdom, your friends' picks, and comparisons between you.",
            "To let you look up a restaurant by name when adding one - your search text (and the city you type, if any) is sent to Google's Places service to find a real matching place. In a small number of cases, and when you import a list, it is sent to Anthropic's Claude API instead. Neither service is given your name or email as part of that request.",
            "To show your places on a map - maps are provided by Google Maps, so opening a map sends your device's IP address and basic browser details to Google, as with any website that embeds Google Maps.",
            "To send you emails: sign-in codes or links so you can access your account; a one-time welcome email when you finish setting up; and, if you've been quiet for a month or more, an occasional reminder with a few highlights of what's new. You can switch the reminders off in Your Profile, or with the link at the bottom of any reminder, and each one includes our contact details.",
            "To improve the app based on feedback you submit.",
          ]} />
          <p className="mt-2 text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
            We do not sell your information, and we do not use it for advertising or ad targeting.
          </p>
        </Section>

        <Section title="Who can see your content">
          <List items={[
            "Your “Next in Line” shortlist (places you want to try) is private - only you can see it.",
            "A crowned restaurant and its review are visible to anyone, if your profile is set to Public; only to you, if set to Private.",
            "A note on a place you've marked as visited (but not crowned) is shown to anyone who follows you, once you've marked it visited - this app does not require your approval for someone to follow you, so treat “followers” as “anyone who knows your username,” not a vetted friends list.",
            "Your username, display name, profile photo and city are visible to anyone who uses the app, and to anyone with your public profile link - even if your profile is set to Private (Private hides your crowns, not your name). Who follows whom is visible too. This is needed for the follow and Court features to work.",
          ]} />
        </Section>

        <Section title="Where your data is stored">
          <p className="text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
            Nomarchy is built on Supabase (database, authentication and file storage) and hosted on Vercel.
            Photos you upload are stored in Supabase Storage. Sign-in emails are delivered via SendGrid.
            Restaurant lookups use Google’s Places service (and, in some cases and for list imports,
            Anthropic’s Claude API), and maps are provided by Google Maps. A “near me” search sends your device’s
            coordinates to OpenStreetMap’s free lookup service to determine your general area - your exact
            coordinates aren’t stored.
          </p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
            Some of these providers (including SendGrid, Vercel, Google and Anthropic) may store or process
            information outside Canada, including in the United States, where it can be accessed under that
            country’s laws. We use established providers and share only what each one needs to do its job.
          </p>
        </Section>

        <Section title="How long we keep it">
          We keep your information while your account is open. If you delete your account, your name, email,
          Next in Line, follows and other personal records are removed right away, and you choose whether
          your crowns, reviews and photos are deleted too, or stay up without your name (credited to “No
          longer a user” and stored under an internal ID that isn’t linked to your name or email). Feedback
          you’ve sent is deleted with your account. Copies may remain for a short time in our providers’
          routine backups before they’re overwritten.
        </Section>

        <Section title="Your choices">
          <List items={[
            "Edit your username, city, profile photo, and privacy setting (Public/Private) any time from Your Profile.",
            "Edit or delete any review, photo, or entry you've added.",
            "Unfollow anyone, or ask someone to stop following you.",
            "Turn off reminder emails in Your Profile, or with the link in any reminder.",
            "Delete your account from Your Profile - this is permanent and can’t be undone. You choose whether your crowns, reviews and photos are deleted with it, or stay up without your name.",
          ]} />
        </Section>

        <Section title="Your rights">
          You can ask to see the personal information we hold about you, ask us to correct it, ask us to
          delete it, or withdraw your consent to how we use it. Email{" "}
          <a href="mailto:hello@nomarchy.ca" style={{ color: C.goldText }}>hello@nomarchy.ca</a> and we’ll respond
          within 30 days. If you live in Quebec you have some additional rights under its privacy law - ask
          us about any of them. If you’re not satisfied with our response, you can contact the Office of the
          Privacy Commissioner of Canada (priv.gc.ca) or, in Quebec, the Commission d’accès à l’information
          (cai.gouv.qc.ca).
        </Section>

        <Section title="Who is responsible">
          Nomarchy’s founder is responsible for how personal information is handled here and is the person to
          contact about this policy, at{" "}
          <a href="mailto:hello@nomarchy.ca" style={{ color: C.goldText }}>hello@nomarchy.ca</a>.
        </Section>

        <Section title="If something goes wrong">
          If a security incident puts your information at real risk of significant harm, we’ll tell you and
          the Privacy Commissioner as the law requires, and keep a record of what happened.
        </Section>

        <Section title="Children">
          Nomarchy isn’t directed at children, and we don’t knowingly collect information from anyone under 14.
        </Section>

        <Section title="Changes to this policy">
          If this policy changes in a meaningful way, we’ll update the date at the top of this page.
        </Section>

        <Section title="Contact">
          Questions about this policy or your data? Reach out at{" "}
          <a href="mailto:hello@nomarchy.ca" style={{ color: C.goldText }}>hello@nomarchy.ca</a>.
        </Section>

        <p className="mt-10 text-center text-xs" style={{ color: C.muted }}>
          <Link href="/" style={{ color: C.goldText }}>Back to Nomarchy</Link>
          {" · "}
          <Link href="/terms" style={{ color: C.goldText }}>Terms of Service</Link>
        </p>
      </div>
    </FontShell>
  );
}

function Section({ title, children }) {
  return (
    <div className="mt-6">
      <h2 className="text-sm font-bold uppercase" style={{ color: C.goldText, letterSpacing: "0.1em" }}>{title}</h2>
      <div className="mt-2 text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>{children}</div>
    </div>
  );
}

function List({ items }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}
