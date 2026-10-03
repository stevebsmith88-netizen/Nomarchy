import { describe, it, expect } from "vitest";
import { profilePreview } from "@/lib/profilePreview";

describe("profile link previews", () => {
  it("shows the name, never a profile photo", () => {
    const m = profilePreview({ username: "steve", display_name: "Steve", is_public: true, avatar_url: "https://x/photo.jpg" });
    expect(m.title).toBe("Steve's Kingdom");
    // The picture itself comes from the generated opengraph-image (name only).
    expect(m.openGraph.images).toBeUndefined();
    expect(m.twitter.card).toBe("summary_large_image");
    expect(JSON.stringify(m)).not.toContain("photo.jpg");
  });

  it("says who the invite is from", () => {
    expect(profilePreview({ username: "steve", display_name: "Steve", is_public: true }, "Steve").title).toBe("Steve has invited you to Nomarchy");
  });

  it("keeps a Private kingdom's preview plain unless its owner sent it as an invite", () => {
    const p = { username: "steve", display_name: "Steve", is_public: false };
    expect(profilePreview(p).title).toBe("Nomarchy");
    expect(profilePreview(p, "someone-else").title).toBe("Nomarchy");
    expect(profilePreview(p, "steve").title).toBe("Steve has invited you to Nomarchy");
    expect(profilePreview(null, "steve").title).toBe("Nomarchy");
  });
});
