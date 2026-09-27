import Link from "next/link";
import { C, display, LogoMark, FontShell } from "../theme";

export const metadata = { title: "Privacy Policy" };

// Plain, real content (not boilerplate filler) reflecting what this app
// actually does - see lib/data.js and schema.sql for the data model this
// describes. Linked from the sign-in screen, and needed as the "Privacy
// Policy" URL on Google's OAuth consent screen branding page.
export default function PrivacyPolicy() {
  return (
    <FontShell>
      <div className="mx-auto max-w-2xl px-5 py-10">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark size={26} />
          <span className="text-lg tracking-[0.1em]" style={{ ...display, fontWeight: 900 }}>NOMARCHY</span>
        </Link>

        <h1 className="mt-8 text-2xl" style={{ ...display, fontWeight: 800 }}>Privacy Policy</h1>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>Last updated: September 2026</p>

        <Section title="What this is">
          Nomarchy is a small app for tracking and comparing your favourite restaurants with friends. This
          page explains what information it collects, why, and what you can do about it.
        </Section>

        <Section title="Information we collect">
          <List items={[
            "Account info: your email address (or your Google account info, if you sign in with Google), and a username you choose.",
            "Profile info: display name, city, and a profile photo, if you add them.",
            "Content you create: restaurants you crown or add to your list, written reviews (“decrees”), ratings, and photos you attach.",
            "Social info: who you follow and who follows you.",
            "Feedback you submit through the in-app feedback form, including your device/browser type (captured automatically so bug reports are easier to act on).",
            "Basic usage data needed to run the app - e.g. when you signed up, when a review was posted.",
          ]} />
        </Section>

        <Section title="How we use it">
          <List items={[
            "To run the app: show your kingdom, your friends' picks, and comparisons between you.",
            "To let you look up a restaurant by name when adding one - your search text is sent to Anthropic's Claude API to find a real matching place. It is not linked to your identity by Anthropic beyond that one request.",
            "To send you sign-in emails (a one-time code or link) so you can access your account.",
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
            "Your username and display name are visible to other signed-in users (needed for the follow/Court features to work).",
          ]} />
        </Section>

        <Section title="Where your data is stored">
          <p className="text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
            Nomarchy is built on Supabase (database, authentication and file storage) and hosted on Vercel.
            Photos you upload are stored in Supabase Storage. Sign-in emails are delivered via SendGrid.
            Restaurant lookups use Anthropic’s Claude API. A “near me” search sends your device’s
            coordinates to OpenStreetMap’s free lookup service to determine your general area - your exact
            coordinates aren’t stored.
          </p>
        </Section>

        <Section title="Your choices">
          <List items={[
            "Edit your username, city, profile photo, and privacy setting (Public/Private) any time from Your Profile.",
            "Edit or delete any review, photo, or entry you've added.",
            "Unfollow anyone, or ask someone to stop following you.",
            "Delete your account entirely from Your Profile - this permanently removes your profile and everything tied to it (thrones, reviews, photos, follows) with no manual cleanup needed and no way to undo it.",
          ]} />
        </Section>

        <Section title="Children">
          Nomarchy isn’t directed at children, and we don’t knowingly collect information from anyone under 13.
        </Section>

        <Section title="Changes to this policy">
          If this policy changes in a meaningful way, we’ll update the date at the top of this page.
        </Section>

        <Section title="Contact">
          Questions about this policy or your data? Reach out at{" "}
          <a href="mailto:hello@nomarchy.ca" style={{ color: C.gold }}>hello@nomarchy.ca</a>.
        </Section>

        <p className="mt-10 text-center text-xs" style={{ color: C.muted }}>
          <Link href="/" style={{ color: C.gold }}>Back to Nomarchy</Link>
          {" · "}
          <Link href="/terms" style={{ color: C.gold }}>Terms of Service</Link>
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

function List({ items }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  );
}
