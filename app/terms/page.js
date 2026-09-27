import Link from "next/link";
import { C, display, LogoMark, FontShell } from "../theme";

export const metadata = { title: "Terms of Service" };

// Kept short and plain on purpose - this is a small friends-and-beta-
// testers app, not an enterprise SaaS product, and the terms should read
// that way. Linked from the sign-in screen, and needed as the "Terms of
// Service" URL on Google's OAuth consent screen branding page.
export default function TermsOfService() {
  return (
    <FontShell>
      <div className="mx-auto max-w-2xl px-5 py-10">
        <Link href="/" className="flex items-center gap-2">
          <LogoMark size={26} />
          <span className="text-lg tracking-[0.1em]" style={{ ...display, fontWeight: 900 }}>NOMARCHY</span>
        </Link>

        <h1 className="mt-8 text-2xl" style={{ ...display, fontWeight: 800 }}>Terms of Service</h1>
        <p className="mt-1 text-sm" style={{ color: C.muted }}>Last updated: September 2026</p>

        <Section title="Using Nomarchy">
          By creating an account, you agree to these terms and to our{" "}
          <Link href="/privacy" style={{ color: C.gold }}>Privacy Policy</Link>. Nomarchy is provided as-is,
          currently in beta, which means things may change, break, or be reset as it’s actively developed.
        </Section>

        <Section title="Your content">
          <p className="text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
            You own what you write and upload - your reviews, photos, and ratings. By posting them, you give
            Nomarchy permission to store and display them back to you and to whoever your privacy settings
            allow (see the Privacy Policy for exactly who that is). Don’t post anything you don’t have the
            right to share, anything illegal, or anything intended to harass or mislead other users.
          </p>
        </Section>

        <Section title="Account responsibility">
          You’re responsible for what happens under your account. Don’t impersonate someone else, and don’t
          use the app to collect other users’ information for anything outside of Nomarchy itself.
        </Section>

        <Section title="Ending your account">
          <p className="text-sm leading-relaxed" style={{ color: C.cream + "CC" }}>
            You can delete your own account at any time from Your Profile - this is permanent and removes
            everything tied to it. We may also suspend or remove an account that violates these terms.
          </p>
        </Section>

        <Section title="No warranty">
          Nomarchy is a small, actively-changing project. It’s provided without warranties of any kind, and
          we aren’t liable for lost data, missed reservations, or any decisions you make based on what’s in
          the app - always double-check details like hours and addresses before you go.
        </Section>

        <Section title="Changes">
          These terms may be updated as the app grows. Continuing to use Nomarchy after a change means you
          accept the updated terms.
        </Section>

        <Section title="Governing law">
          These terms are governed by the laws of the Province of Ontario, Canada.
        </Section>

        <Section title="Contact">
          Questions about these terms? Reach out at{" "}
          <a href="mailto:hello@nomarchy.ca" style={{ color: C.gold }}>hello@nomarchy.ca</a>.
        </Section>

        <p className="mt-10 text-center text-xs" style={{ color: C.muted }}>
          <Link href="/" style={{ color: C.gold }}>Back to Nomarchy</Link>
          {" · "}
          <Link href="/privacy" style={{ color: C.gold }}>Privacy Policy</Link>
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
