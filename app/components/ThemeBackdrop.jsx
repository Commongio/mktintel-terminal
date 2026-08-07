"use client";
// ThemeBackdrop.jsx — terminal themes.
//
// Themes are modules in ./themes, registered in ./themes/registry.js. Each owns
// its own particles, geometry and math; nothing is shared and adding one
// touches no existing theme. See docs/THEMES.md for the contract.
//
// This file provides everything a theme must NOT reimplement: canvas creation,
// sizing, the DPR transform, the rAF loop, a guaranteed first paint, the
// tab-hidden pause, teardown, and the user's filter and colour tint.
//
// `none` renders nothing — page.js draws its own dot-grid CSS background.
//
// Video themes are gone (12MB of MP4 over the wire) but the machinery remains:
// lib/videoThemes.js behaves correctly against an empty registry, so dropping
// an asset back in still works. See public/themes/README.md.
//
// Choosing a non-Classic theme is an explicit opt-in to motion, so it renders
// regardless of the OS "reduce motion" setting — many users have Windows
// animation effects off, which browsers report as prefers-reduced-motion, and
// that must NOT blank a backdrop the user deliberately selected.

import { useRef, useEffect } from "react";
import VideoBackdrop from "./VideoBackdrop";
import { AVAILABLE_VIDEO_THEMES, isVideoTheme, videoThemeSrc } from "../../lib/videoThemes";
import { CANVAS_THEMES, getTheme, makeRgba } from "./themes/registry";

// Unified list consumed by the Themes settings tab.
export const THEME_LIST = [
  { id: "none", label: "Classic", desc: "Clean dot-grid terminal", group: "basic" },
  ...CANVAS_THEMES.map((t) => ({ id: t.id, label: t.label, desc: t.desc, group: "basic" })),
  ...AVAILABLE_VIDEO_THEMES.map((t) => ({ id: t.id, label: t.label, desc: t.desc, mb: t.mb, group: "video" })),
];
export { isVideoTheme };

// ── canvas host ───────────────────────────────────────────────────────────────
function CanvasThemes({ theme, accent }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const mod = getTheme(theme);
    if (!canvas || !mod) return;

    const ctx = canvas.getContext("2d");
    // Capped at 1.5: a 3x retina canvas triples the fill cost for a backdrop
    // nobody is looking at directly.
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const rgba = makeRgba(accent);

    let w = 0, h = 0, state = null;

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Re-init on resize so themes can rebuild geometry for the new aspect.
      // Themes seed deterministically from an index rather than Math.random(),
      // so this reshapes the field instead of reshuffling it — otherwise
      // dragging a window edge would restart the animation.
      state = mod.init ? mod.init({ w, h, accent }) : {};
    };

    resize();
    window.addEventListener("resize", resize);

    let raf, running = true;
    const onVis = () => {
      running = document.visibilityState !== "hidden";
      if (running) raf = requestAnimationFrame(loop);
      else cancelAnimationFrame(raf);
    };
    document.addEventListener("visibilitychange", onVis);

    // Separate from the rAF loop so the first paint is guaranteed. rAF is
    // throttled to zero in some embedded and automation contexts and on
    // background tabs, which previously presented as "the theme is not
    // displaying at all".
    const draw = (now) => {
      ctx.clearRect(0, 0, w, h);
      mod.draw({ ctx, w, h, now, accent, state, rgba });
    };

    const loop = (now) => {
      if (!running) return;
      draw(now);
      raf = requestAnimationFrame(loop);
    };

    draw(performance.now());
    raf = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      if (mod.destroy) mod.destroy(state);
    };
  }, [theme, accent]);

  return (
    <canvas
      ref={ref}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      aria-hidden="true"
    />
  );
}

export default function ThemeBackdrop({ theme = "none", accent = "#4C9E92", filter = "none", tint = "", tintStrength = 0.5 }) {
  if (theme === "none") return null;

  const videoSrc = isVideoTheme(theme) ? videoThemeSrc(theme) : null;

  // Colour tint: a blend layer over the theme. mix-blend-mode "color" re-hues
  // it while KEEPING luminance and detail — so any theme can be made
  // teal/purple/amber without washing to a flat block, which a plain opacity
  // overlay would do. Only rendered when a tint is actually set.
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
