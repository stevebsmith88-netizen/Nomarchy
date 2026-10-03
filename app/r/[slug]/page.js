// Public restaurant page (nomarchy.ca/r/<slug>). Rendered on the server,
// with the public (anon) key, so search engines and link previews get the
// real content and every visitor - signed in or not - sees the same thing:
// crowns from Public kingdoms only (place_page in schema.sql).
import { cache } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import RestaurantPageClient from "./RestaurantPageClient";
import { restaurantPreview } from "@/lib/restaurantPage";

// cache(): generateMetadata and the page share one lookup per request.
const fetchPlacePage = cache(async (slug) => {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase.rpc("place_page", { p_slug: slug });
    return error ? null : data;
  } catch {
    return null;
  }
});

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
