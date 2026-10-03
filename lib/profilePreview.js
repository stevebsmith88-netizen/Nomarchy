// What a shared profile or invite link shows as its preview card
// (iMessage, WhatsApp, Instagram...). Always the person's name and the
// Nomarchy logo - never their profile photo.

const PREVIEW_IMAGE = { url: "/icon-512.png", width: 512, height: 512 };

export function profilePreview(profile, invite) {
  if (!profile) return { title: "Nomarchy" };
  const name = profile.display_name || profile.username;
  const isInvite = typeof invite === "string" && invite.trim().toLowerCase() === profile.username;
  // A Private kingdom gets a plain preview, unless its owner sent this as
  // an invite - then it says who it's from (their name is all it shows).
  if (!profile.is_public && !isInvite) return { title: "Nomarchy" };

  const title = isInvite ? `${name} has invited you to Nomarchy` : `${name}'s Kingdom`;
  const description = isInvite
    ? "Crown your favourite restaurant in every cuisine, and see what your friends swear by."
    : `See ${name}'s crowned favourite restaurants on Nomarchy, and start your own kingdom.`;
  return {
    title,
    description,
    openGraph: { title: `${title} | Nomarchy`, description, images: [PREVIEW_IMAGE] },
    twitter: { card: "summary", title: `${title} | Nomarchy`, description, images: [PREVIEW_IMAGE.url] },
  };
}
