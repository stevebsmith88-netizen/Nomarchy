import "./globals.css";

const description = "Crown your favourite restaurant in every cuisine, stage a coup when something better comes along, and compare your kingdom with friends.";

export const metadata = {
  metadataBase: new URL("https://nomarchy.ca"),
  title: { default: "Nomarchy", template: "%s | Nomarchy" },
  description,
  appleWebApp: {
    title: "Nomarchy",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Nomarchy",
    description,
    url: "https://nomarchy.ca",
    siteName: "Nomarchy",
    images: [{ url: "/icon-512.png", width: 512, height: 512 }],
    locale: "en_CA",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Nomarchy",
    description,
    images: ["/icon-512.png"],
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
