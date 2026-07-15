// lib/videoThemes.js — looping-video theme registry (replaces Spline entirely).
//
// WHY: Spline was cut in V10.4. Its scenes carried a "Built with Spline" free-plan
// attribution badge we couldn't remove without a paid plan, pulled a heavy 3D
// runtime into the bundle, and hosted the assets on a third-party CDN we didn't
// control. Royalty-free looping videos give the same visual payoff with assets we
// own outright: no badge, no third-party runtime, no external dependency.
//
// ── HOW TO ADD A THEME ────────────────────────────────────────────────────────
// 1. Drop the file in:  public/themes/<id>.mp4
// 2. Add one row below. That's it — it appears in Settings → Themes automatically.
//
// A theme is only listed if `file` is set. Rows with file:null are placeholders
// waiting on an asset, and are hidden from the picker (so nobody can select a
// theme that would render a black screen).
//
// ── ASSET GUIDANCE (matters — these ship to every user) ──────────────────────
// - Format: MP4 (H.264) — universal. Optionally add a WebM for better compression.
// - Keep each file UNDER ~8MB. These are served from your origin on every page
//   load that selects them; a 60MB clip will wreck first paint. Encode hard:
//     ffmpeg -i in.mp4 -t 12 -an -vf "scale=1920:-2,fps=24" -c:v libx264 -crf 30 -preset slow out.mp4
// - Strip audio (-an). Backgrounds must be silent; browsers also refuse to
//   autoplay anything with sound.
// - 10-20s, and make it LOOP SEAMLESSLY (first and last frame should match) or
//   users will see a visible jump every cycle.
// - Prefer dark, low-contrast, low-motion footage. The terminal's text sits on
//   top of this; busy footage destroys readability.

// Gio's royalty-free set. All re-encoded for the web: audio stripped (a background
// must be silent, and it saves bytes), capped at 1600px wide, H.264 + faststart.
// 52MB of source → 12MB shipped. Originals are kept in /media-source (gitignored).
export const VIDEO_THEMES = [
  // id             label            file                  desc                                    mb
  { id: "stars",         label: "Stars",         file: "stars.mp4",         desc: "Drifting starfield",              mb: 0.7 },
  { id: "veil",          label: "Veil",          file: "veil.mp4",          desc: "Soft drifting veil",              mb: 0.3 },
  { id: "waves",         label: "Waves",         file: "waves.mp4",         desc: "Slow rolling waves",              mb: 0.2 },
  { id: "globe",         label: "Globe",         file: "globe.mp4",         desc: "Rotating wireframe globe",        mb: 1.1 },
  { id: "geo-earth",     label: "Geo Earth",     file: "geo-earth.mp4",     desc: "Geometric earth grid",            mb: 4.5 },
  { id: "earth",         label: "Earth",         file: "earth.mp4",         desc: "Earth from orbit",                mb: 1.6 },
  { id: "sun",           label: "Sun",           file: "sun.mp4",           desc: "Burning solar surface",           mb: 2.2 },
  { id: "particle-tube", label: "Particle Tube", file: "particle-tube.mp4", desc: "Particle tunnel",                 mb: 1.4 },
];

// Only themes whose asset actually exists.
export const AVAILABLE_VIDEO_THEMES = VIDEO_THEMES.filter((t) => !!t.file);

export const videoThemeIds = () => AVAILABLE_VIDEO_THEMES.map((t) => t.id);
export const isVideoTheme = (id) => AVAILABLE_VIDEO_THEMES.some((t) => t.id === id);
export const videoThemeSrc = (id) => {
  const t = AVAILABLE_VIDEO_THEMES.find((x) => x.id === id);
  return t?.file ? `/themes/${t.file}` : null;
};

// The Kronos bot orb. Point this at a looping video (e.g. a galaxy/energy-core
// clip) and the orb renders it, radial-masked and VIX-tinted. Leave null and the
// orb falls back to the hand-coded canvas orb — which is fully functional, so the
// bot is never broken by a missing asset.
export const ORB_VIDEO = null; // e.g. "orb.mp4" in public/themes/
export const orbVideoSrc = () => (ORB_VIDEO ? `/themes/${ORB_VIDEO}` : null);
