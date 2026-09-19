export default function manifest() {
  return {
    name: "Nomarchy",
    short_name: "Nomarchy",
    description: "A kingdom of your favorite restaurants, one cuisine at a time.",
    start_url: "/",
    display: "standalone",
    background_color: "#1C1326",
    theme_color: "#1C1326",
    icons: [
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
