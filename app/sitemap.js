import { createClient } from "@supabase/supabase-js";
import { restaurantUrl } from "@/lib/restaurantPage";

// The home page, plus every restaurant page with at least one crown from a
// Public kingdom (place_pages_for_sitemap in schema.sql) - empty pages are
// left out, and marked noindex on the page itself. Public profile pages
// aren't listed yet. If the database can't be reached, the home page alone
// is still served.
export const revalidate = 3600;

export default async function sitemap() {
  const home = { url: "https://nomarchy.ca", lastModified: new Date(), changeFrequency: "weekly", priority: 1 };
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase.rpc("place_pages_for_sitemap");
    if (error || !Array.isArray(data)) return [home];
    return [
      home,
      ...data.map((r) => ({ url: restaurantUrl(r.slug), lastModified: new Date(r.updated_at), changeFrequency: "weekly", priority: 0.6 })),
    ];
  } catch {
    return [home];
  }
}
