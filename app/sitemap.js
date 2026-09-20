// Just the root page for now - public profile pages (/[username]) aren't
// listed here yet since with only a couple of users, there's nothing
// meaningful for a crawler to index there. Worth adding once there are
// enough public kingdoms to be worth surfacing in search results.
export default function sitemap() {
  return [
    {
      url: "https://nomarchy.ca",
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
