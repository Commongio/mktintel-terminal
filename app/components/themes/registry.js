// app/components/themes/registry.js — the canvas-theme contract.
//
// Replaces the if/else chain that used to live inside CanvasThemes.draw().
// Every theme is a self-contained module owning its own particles, fog,
// geometry and math; nothing is shared, and adding one touches no existing
// theme.
//
// ── THE CONTRACT ────────────────────────────────────────────────────────────
//
//   id       stable forever. Persisted in localStorage; renaming orphans every
//            user sitting on it (add the old id to RETIRED_THEMES if you must).
//   label    shown in Settings
//   desc     one line, shown under the label
//
//   init({ w, h, accent })   -> state
//            Called once per (theme, accent, resize). Build particle arrays,
//            geometry, seeds. NEVER use Math.random() here: a resize re-runs
//            init, and a randomly seeded field visibly jumps every time the
//            window changes size. Use a deterministic hash of the index.
//
//   draw({ ctx, w, h, now, accent, state, rgba })
//            Pure function of its arguments. Called once directly for the
//            guaranteed first paint and then from rAF, so mutating `state`
//            here advances the animation twice on the first frame.
//
//   destroy(state)  optional. Only for themes holding something the GC will
//            not reclaim. Pure-canvas themes do not need it.
//
// `rgba(hex, alpha)` is supplied so a theme never parses colour itself.

import midnight from "./midnight.js";
import obsidian from "./obsidian.js";
import carbon from "./carbon.js";
import quantum from "./quantum.js";
import eclipse from "./eclipse.js";
import blueprint from "./blueprint.js";
import deepcurrent from "./deepcurrent.js";
import pulse from "./pulse.js";
import aurora from "./aurora.js";
import gridpulse from "./gridpulse.js";

/**
 * Order is display order in Settings. Midnight first: it is the signature
 * theme and the intended default for new users.
 */
export const CANVAS_THEMES = [
  // The Kronos Collection, in the order they were designed. The family rule:
  // no bright colours, no fast motion, nothing that competes with a chart,
  // and each one recognisable from the others at a glance.
  midnight, obsidian, carbon, quantum, eclipse, blueprint, deepcurrent, pulse,
  // Predecessors, kept because they work and someone may be sitting on one.
  aurora, gridpulse,
];

export const THEME_BY_ID = Object.fromEntries(CANVAS_THEMES.map((t) => [t.id, t]));

export const getTheme = (id) => THEME_BY_ID[id] ?? null;

/**
 * Shared helpers, passed INTO draw rather than imported by each theme, so a
 * theme file has no imports at all and can be reviewed in isolation.
 */
export function makeRgba(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (alpha) => `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Deterministic pseudo-random in [0,1) from an integer.
 *
 * Every theme seeds from this rather than Math.random(). init() re-runs on
 * resize, and a random field would reshuffle itself each time the user dragged
 * a window edge -- which reads as the theme restarting.
 */
export function hashRandom(i, salt = 0) {
  let x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
