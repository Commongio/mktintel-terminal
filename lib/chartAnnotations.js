// lib/chartAnnotations.js — V10.6 shared annotation model for the chart.
//
// Annotations are DATA, not imperative draw calls. The AI (and the UI) mutate
// this list; LightweightChart renders whatever it's given. That means
// persistence, undo, and cross-device sync are free — and the AI can never get
// the chart into a state the UI can't reproduce or clear.
//
// Shapes (all carry `id` + `symbol`):
//   level     — horizontal price line. kind: entry | tp | sl | alert | note
//   trendline — two-point line: from/to {time, price}
//   marker    — a glyph pinned to a candle: {time, price?, text, shape, position}

export const ANNOTATION_KEY = "kronos_chart_annotations";

// Semantic colors. Deliberately NOT the user's accent: a stop-loss must read as
// danger regardless of what accent they picked.
export const LEVEL_KINDS = {
  entry: { color: "#7eb8f7", style: "solid", label: "ENTRY" },
  tp: { color: "#00e676", style: "dashed", label: "TP" },
  sl: { color: "#ff3d57", style: "dashed", label: "SL" },
  alert: { color: "#f7c948", style: "dotted", label: "ALERT" },
  note: { color: "#a78bfa", style: "dotted", label: "" },
};

let _seq = 0;
export const newId = () => `a${Date.now().toString(36)}${(_seq++).toString(36)}`;

// ── normalizers ───────────────────────────────────────────────────────────────
// The AI is a language model: it will hand us "12,345.60", "$450", or a number.
// Everything entering the model gets coerced here so a bad tool call degrades to
// "ignored" rather than crashing the chart.
export function num(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function makeLevel({ symbol, price, kind = "note", label = "" }) {
  const p = num(price);
  if (p == null) return null;
  const k = LEVEL_KINDS[kind] ? kind : "note";
  return { id: newId(), symbol, type: "level", price: p, kind: k, label: String(label || "").slice(0, 40) };
}

export function makeTrendline({ symbol, from, to, label = "", color = "#a78bfa" }) {
  const fp = num(from?.price), tp = num(to?.price);
  const ft = toUnix(from?.time), tt = toUnix(to?.time);
  if (fp == null || tp == null || ft == null || tt == null) return null;
  return {
    id: newId(), symbol, type: "trendline",
    from: { time: ft, price: fp }, to: { time: tt, price: tp },
    label: String(label || "").slice(0, 40), color,
  };
}

export function makeMarker({ symbol, time, text = "", shape = "circle", position = "aboveBar", color = "#7eb8f7" }) {
  const t = toUnix(time);
  if (t == null) return null;
  const shapes = ["circle", "square", "arrowUp", "arrowDown"];
  const positions = ["aboveBar", "belowBar", "inBar"];
  return {
    id: newId(), symbol, type: "marker", time: t,
    text: String(text || "").slice(0, 40),
    shape: shapes.includes(shape) ? shape : "circle",
    position: positions.includes(position) ? position : "aboveBar",
    color,
  };
}

// Accepts a unix-seconds number, a ms number, or an ISO/date string.
// Lightweight Charts wants SECONDS.
export function toUnix(t) {
  if (t == null) return null;
  if (typeof t === "number" && Number.isFinite(t)) {
    return t > 1e11 ? Math.floor(t / 1000) : Math.floor(t); // ms vs s
  }
  const ms = Date.parse(String(t));
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

// Snap an arbitrary time to the nearest real candle. The AI won't know exact
// candle timestamps, so an unsnapped trendline endpoint would either be dropped
// by the library or float off the plotted range. Snapping makes a roughly-right
// answer render correctly instead of not at all.
export function snapToCandle(unixTime, candles) {
  if (!candles?.length || unixTime == null) return unixTime;
  let best = candles[0].time, bestD = Math.abs(candles[0].time - unixTime);
  for (const c of candles) {
    const d = Math.abs(c.time - unixTime);
    if (d < bestD) { bestD = d; best = c.time; }
  }
  return best;
}

// ── persistence ───────────────────────────────────────────────────────────────
// Always an ARRAY, in and out. Annotations sync across devices via
// KRONOS_LS_KEYS, so this parses whatever is in storage defensively: a
// half-written or hand-edited value must degrade to "no drawings", never to a
// crash on the chart page.
export function loadAnnotations() {
  try {
    const raw = JSON.parse(localStorage.getItem(ANNOTATION_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((a) => a && typeof a === "object" && a.type && a.symbol);
  } catch { return []; }
}
export function saveAnnotations(list) {
  try { localStorage.setItem(ANNOTATION_KEY, JSON.stringify(Array.isArray(list) ? list : [])); } catch {}
}
