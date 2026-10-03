import { previewImage, PREVIEW_SIZE } from "@/lib/previewImage";

// The default picture for a shared Nomarchy link (see lib/previewImage.js).
export const alt = "Nomarchy - long live your favourites";
export const size = PREVIEW_SIZE;
export const contentType = "image/png";

export default function Image() {
  return previewImage();
}
