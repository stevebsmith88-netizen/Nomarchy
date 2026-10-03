// Public restaurant page (nomarchy.ca/r/<slug>). Rendered on the server,
// with the public (anon) key, so search engines and link previews get the
// real content and every visitor - signed in or not - sees the same thing:
// crowns from Public kingdoms only (place_page in schema.sql).
import { cache } from "react";
import { notFound } from "next/navigation";
import RestaurantPageClient from "./RestaurantPageClient";
import { restaurantPreview } from "@/lib/restaurantPage";
import { fetchPlacePageData } from "@/lib/publicFetch";

// cache(): generateMetadata and the page share one lookup per request.
const fetchPlacePage = cache(fetchPlacePageData);

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return restaurantPreview(await fetchPlacePage(slug));
}

export default async function Page({ params }) {
  const { slug } = await params;
  const page = await fetchPlacePage(slug);
  if (!page) notFound();
  return <RestaurantPageClient page={page} />;
}
