import { previewImage, PREVIEW_SIZE } from "@/lib/previewImage";
import { fetchPlacePageData } from "@/lib/publicFetch";

// A restaurant page's shared-link picture: its name and where it is.
export const alt = "A restaurant on Nomarchy";
export const size = PREVIEW_SIZE;
export const contentType = "image/png";

export default async function Image({ params }) {
  const { slug } = await params;
  const page = await fetchPlacePageData(slug);
  if (!page) return previewImage();
  const where = [page.neighbourhood, page.city].filter(Boolean).join(", ");
  const crowned = page.crown_count > 0 ? `Crowned ${page.crown_count === 1 ? "once" : `${page.crown_count} times`} on Nomarchy` : "On Nomarchy";
  return previewImage({ title: page.name, subtitle: where ? `${where}  ·  ${crowned}` : crowned });
}
