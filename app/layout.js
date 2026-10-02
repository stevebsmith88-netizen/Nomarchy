import "./globals.css";
import { ThemeProvider } from "./theme";
import RefCapture from "./RefCapture";
import A11yHelpers from "./A11yHelpers";

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
  // Light is the default; ThemeProvider switches this to match a saved
  // dark choice (and follows the toggle) once the app is running.
  themeColor: "#F5ECDE",
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: the inline script below may set an
    // attribute and style on <html> before React hydrates it.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Light is the default theme. For someone whose saved choice is
            dark, hide the page and paint the dark background until
            ThemeProvider has applied it, so they never see a flash of
            light. The timer is a safety net: if the app somehow never
            loads, the page still shows after 2.5s rather than staying blank. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("nomarchy-theme")==="dark"){var d=document.documentElement;d.style.setProperty("--page-bg","#1D1326");d.setAttribute("data-theme-pending","1");setTimeout(function(){d.removeAttribute("data-theme-pending")},2500)}}catch(e){}`,
          }}
        />
      </head>
      <body>
        <RefCapture />
        <A11yHelpers />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
