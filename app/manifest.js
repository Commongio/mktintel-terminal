// app/manifest.js — V11 M2: PWA manifest.
//
// Next 16 App Router file convention: this route GENERATES /manifest.webmanifest.
// Do NOT also drop a static public/manifest.json — two manifests is how you get a
// confusing "which one won?" bug.
//
// Installing to the home screen isn't cosmetic here: on iOS, Web Push ONLY works
// for an app installed to the home screen (16.4+). So this file is a hard
// prerequisite for M3 push, not just a nicety.
export default function manifest() {
  return {
    name: "KRONOS — Trading Terminal",
    short_name: "KRONOS",
    description: "Live trading intelligence, signals, and AI desk.",
    start_url: "/",
    // standalone = no browser chrome. This is what makes it read as an app
    // rather than a bookmark.
    display: "standalone",
    orientation: "portrait",
    background_color: "#05080F",
    theme_color: "#05080F",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // `maskable` lets Android crop to its own shape without clipping the glyph.
      // Needs its own padded artwork — reusing the `any` icon here would get the
      // edges shaved off on some launchers.
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
