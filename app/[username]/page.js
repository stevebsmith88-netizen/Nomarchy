// Server component wrapper - the actual page is PublicProfileClient (a
// client component, needed for the follow button and live data loading).
// This file exists only so a shared link gets a real, per-person preview
// card (their name + the Nomarchy logo) on iMessage/Instagram/Slack instead of generic
// site-wide branding - generateMetadata only runs in a server component,
// so the interactive page had to be split out to make room for it.
import PublicProfileClient from "./PublicProfileClient";
import { profilePreview } from "@/lib/profilePreview";
import { fetchProfileForMeta } from "@/lib/publicFetch";

export async function generateMetadata({ params, searchParams }) {
  const { username } = await params;
  const { invite } = (await searchParams) || {};
  return profilePreview(await fetchProfileForMeta(username), invite);
}

export default async function Page({ params, searchParams }) {
  const { username } = await params;
  const { invite } = (await searchParams) || {};
  // An invite link (?invite=<this username>) shows the invite banner.
  const invited = typeof invite === "string" && invite.trim().toLowerCase() === username.toLowerCase();
  return <PublicProfileClient username={username} invited={invited} />;
}
