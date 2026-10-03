import { previewImage, PREVIEW_SIZE } from "@/lib/previewImage";
import { fetchProfileForMeta } from "@/lib/publicFetch";

// A kingdom's shared-link picture: the person's name only - never their
// profile photo. A Private kingdom gets the plain Nomarchy picture.
export const alt = "A kingdom on Nomarchy";
export const size = PREVIEW_SIZE;
export const contentType = "image/png";

export default async function Image({ params }) {
  const { username } = await params;
  const profile = await fetchProfileForMeta(username);
  if (!profile?.is_public) return previewImage();
  return previewImage({ title: `${profile.display_name || profile.username}'s Kingdom`, subtitle: "Join them on Nomarchy" });
}
