"use client";
// ThemeBackdrop.jsx — terminal themes (V10.4: canvas + looping video; Spline removed).
//
// BASIC (canvas/CSS, ~0KB, always fast):
//   none      — Classic: no backdrop canvas; page.js renders its dot-grid CSS bg.
//   aurora    — slow aurora ribbons.
//   gridpulse — perspective data-grid with traveling pulses.
//
// VIDEO (looping royalty-free clips we own — see lib/videoThemes.js):
//   Registered in VIDEO_THEMES. Only themes with an actual asset file are listed,
//   so an unshipped theme can never render as a black screen.
//
// All themes accept the user's CSS color filter (hue/sat/brightness).
// Choosing a non-Classic theme is an explicit opt-in to motion, so we render it
// regardless of the OS "reduce motion" setting (many users have Windows animation
// effects off, which browsers report as prefers-reduced-motion; that must NOT
// blank a backdrop the user deliberately selected).

import { useRef, useEffect } from "react";
import VideoBackdrop from "./VideoBackdrop";
import { AVAILABLE_VIDEO_THEMES, isVideoTheme, videoThemeSrc } from "../../lib/videoThemes";

// Basic canvas themes.
const BASIC_THEMES = [
  { id: "none",      label: "Classic",    desc: "Clean dot-grid terminal" },
  { id: "aurora",    label: "Aurora",     desc: "Slow aurora ribbons" },
  { id: "gridpulse", label: "Grid Pulse", desc: "Perspective data-grid with traveling pulses" },
];

// Unified list consumed by the Themes settings tab.
export const THEME_LIST = [
  ...BASIC_THEMES.map((t) => ({ ...t, group: "basic" })),
  ...AVAILABLE_VIDEO_THEMES.map((t) => ({ id: t.id, label: t.label, desc: t.desc, mb: t.mb, group: "video" })),
];
export { isVideoTheme };

// ── canvas renderer for the lightweight themes ────────────────────────────────
function CanvasThemes({ theme, accent }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    let w = 0, h = 0;
    const resize = () => { w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    window.addEventListener("resize", resize);

    const ac = (a) => {
      const n = parseInt(String(accent).replace("#", ""), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    };

    let ribbons;
    if (theme === "aurora") ribbons = Array.from({ length: 3 }, (_, i) => ({ off: i * 2.1, hue: i }));

    let raf, running = true;
    const onVis = () => { running = document.visibilityState !== "hidden"; if (running) raf = requestAnimationFrame(loop); else cancelAnimationFrame(raf); };
    document.addEventListener("visibilitychange", onVis);

    const loop = (now) => {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);

      if (theme === "aurora") {
        for (const r0 of ribbons) {
          ctx.beginPath();
          for (let x = 0; x <= w; x += 14) {
            const y = h * (0.25 + r0.hue * 0.22) + Math.sin(x / 190 + now / (5200 + r0.hue * 900) + r0.off) * 60 + Math.sin(x / 67 + now / 3400) * 22;
            x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
          }
          const cols = [ac(0.10), "rgba(126,184,247,0.09)", "rgba(167,139,250,0.08)"];
          ctx.strokeStyle = cols[r0.hue % 3];
          ctx.lineWidth = 46; ctx.lineCap = "round";
          ctx.filter = "blur(18px)"; ctx.stroke(); ctx.filter = "none";
        }
      }

      if (theme === "gridpulse") {
        const horizon = h * 0.42;
        ctx.strokeStyle = ac(0.10); ctx.lineWidth = 1;
        for (let i = 0; i <= 24; i++) {
          const t = i / 24, x = w / 2 + (t - 0.5) * w * 2.2;
          ctx.beginPath(); ctx.moveTo(w / 2 + (t - 0.5) * w * 0.5, horizon); ctx.lineTo(x, h); ctx.stroke();
        }
        for (let i = 0; i < 14; i++) {
          const t = ((now / 2600) + i / 14) % 1, y = horizon + Math.pow(t, 2.2) * (h - horizon);
          ctx.globalAlpha = 0.25 * t + 0.03; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); ctx.globalAlpha = 1;
        }
        for (let i = 0; i < 4; i++) {
          const t = ((now / 1900) + i * 0.27) % 1, lane = [0.2, 0.4, 0.6, 0.8][i];
          const x = w / 2 + (lane - 0.5) * w * (0.5 + 1.7 * Math.pow(t, 2.2)), y = horizon + Math.pow(t, 2.2) * (h - horizon);
          ctx.fillStyle = ac(0.5 * (1 - t) + 0.1); ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
        }
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", onVis); };
  }, [theme, accent]);

  return <canvas ref={ref} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} aria-hidden="true" />;
}

export default function ThemeBackdrop({ theme = "none", accent = "#00d4aa", filter = "none", tint = "", tintStrength = 0.5 }) {
  if (theme === "none") return null;

  const videoSrc = isVideoTheme(theme) ? videoThemeSrc(theme) : null;

  // Color tint: a blend layer over the theme. mix-blend-mode "color" re-hues the
  // footage to the chosen color while KEEPING its luminance/detail — so the user
  // can make any theme teal/purple/amber without washing it to a flat block, which
  // a plain opacity overlay would do. Only rendered when a tint is actually set.
  const tintLayer = tint && tintStrength > 0
    ? <div style={{ position: "absolute", inset: 0, background: tint, mixBlendMode: "color", opacity: Math.min(1, tintStrength), pointerEvents: "none" }} />
    : null;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }} aria-hidden="true">
      {videoSrc
        ? <VideoBackdrop src={videoSrc} filter={filter} />
        : <div style={{ position: "absolute", inset: 0, filter }}><CanvasThemes theme={theme} accent={accent} /></div>}
      {tintLayer}
    </div>
  );
}
