// Server component wrapper - the actual page is PublicProfileClient (a
// client component, needed for the follow button and live data loading).
// This file exists only so a shared link gets a real, per-person preview
// card (name + avatar) on iMessage/Instagram/Slack instead of generic
// site-wide branding - generateMetadata only runs in a server component,
// so the interactive page had to be split out to make room for it.
import { createClient } from "@supabase/supabase-js";
import PublicProfileClient from "./PublicProfileClient";

async function fetchProfileForMeta(username) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data } = await supabase
    .from("profiles")
    .select("username, display_name, avatar_url, is_public")
    .eq("username", username)
    .single();
  return data;
}

export async function generateMetadata({ params }) {
  const { username } = await params;
  const profile = await fetchProfileForMeta(username);

  if (!profile || !profile.is_public) {
    return { title: "Nomarchy" };
  }

  const name = profile.display_name || profile.username;
  const title = `${name}'s Kingdom`;
  const description = `See ${name}'s crowned favourite restaurants on Nomarchy, and start your own kingdom.`;

  return {
    title,
    description,
    openGraph: {
      title: `${title} | Nomarchy`,
      description,
      images: profile.avatar_url ? [{ url: profile.avatar_url }] : undefined,
    },
    twitter: {
      card: "summary",
      title: `${title} | Nomarchy`,
      description,
    },
  };
}

export default async function Page({ params }) {
  const { username } = await params;
  return <PublicProfileClient username={username} />;
}
