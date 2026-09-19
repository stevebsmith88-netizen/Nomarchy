import "./globals.css";

export const metadata = {
  title: "Nomarchy",
  description: "A kingdom of your favorite restaurants, one cuisine at a time.",
  appleWebApp: {
    title: "Nomarchy",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  themeColor: "#1C1326",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
