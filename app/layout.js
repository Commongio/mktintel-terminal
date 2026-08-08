// app/layout.js
import "./globals.css";

export const metadata = {
  // V14.6: the last surviving "MKTINTEL PRO" string. It was only in <title>, but
  // that's the highest-visibility place it could have been: the browser tab, and
  // the fallback a link unfurler uses when there's no Open Graph block — so every
  // shared link previewed under the old brand name.
  metadataBase: new URL("https://kronosterminal.online"),
  title: "KRONOS",
  description: "Live trading intelligence terminal — continuous market scanning, multi-agent signals, and an AI desk.",
  applicationName: "KRONOS",
  // Explicit OG/Twitter blocks so a shared link is DESIGNED rather than inferred.
  // Without these, iMessage/Slack/Discord fall back to <title> + a guessed icon.
  openGraph: {
    title: "KRONOS",
    siteName: "KRONOS",
    description: "Live trading intelligence terminal — continuous market scanning, multi-agent signals, and an AI desk.",
    url: "https://kronosterminal.online",
    type: "website",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512, alt: "KRONOS" }],
  },
  twitter: {
    card: "summary",           // summary, not summary_large_image — the asset is a square logo, not a banner
    title: "KRONOS",
    description: "Live trading intelligence terminal.",
    images: ["/icons/icon-512.png"],
  },
  // iOS ignores the web manifest's `display: standalone`; it needs these legacy
  // apple-* meta tags to launch chrome-less from the home screen. Without them an
  // "installed" app still opens with Safari's URL bar — and since iOS only
  // delivers Web Push to a true home-screen install, getting this wrong quietly
  // breaks M3 push too.
  appleWebApp: {
    capable: true,
    title: "KRONOS",
    statusBarStyle: "black-translucent",
  },
  // V13.7: icons come from the Next file conventions — app/icon.png (favicon) and
  // app/apple-icon.png (iOS home-screen touch icon = the new TK-monogram logo).
  formatDetection: {
    // Stop iOS auto-linking numbers as phone calls — a trading terminal is full
    // of prices and strikes that would become blue tap-to-call links.
    telephone: false,
  },
};

// Next 16 requires viewport to be its own export, not a key inside `metadata`.
export const viewport = {
  themeColor: "#05080F",
  width: "device-width",
  initialScale: 1,
  // Deliberately NOT locking zoom (no maximumScale / userScalable:false) —
  // pinch-zoom is an accessibility affordance. The 16px input rule in page.js
  // already kills the iOS focus-zoom that usually tempts people to disable it.
  viewportFit: "cover", // allows the shell to paint into the iPhone safe areas
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
