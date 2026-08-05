// lib/signalLabels.js — V13.5 signal terminology.
//
// The engine speaks ONE internal vocabulary (direction: LONG/SHORT/NEUTRAL,
// status: FIRE/HOLD/SCAN) across every asset class — that keeps signalEngine.js
// and signalLifecycle.js asset-class-agnostic. This module is the single place
// that translates that internal vocabulary into the user-facing words each asset
// class actually uses, so the terminology is consistent everywhere a signal is
// shown and there's exactly one place to change it.
//
//   options → CALLS / PUTS      (an options trade is a call or a put, never "long")
//   futures → LONG / SHORT      (funded-account futures language)
//   equity  → BUY / HOLD / SELL (portfolio-growth language; NEUTRAL = HOLD here,
//                                a real position stance, not "no setup")

// The directional word for a fired/forming setup.
export function directionLabel(direction, assetClass) {
  const d = String(direction || "").toUpperCase();
  if (assetClass === "options") {
    if (d === "LONG") return "CALLS";
    if (d === "SHORT") return "PUTS";
    return "NEUTRAL";
  }
  if (assetClass === "equity") {
    if (d === "LONG") return "BUY";
    if (d === "SHORT") return "SELL";
    return "HOLD";
  }
  // futures (and any unknown class) keep the raw long/short language.
  return d || "NEUTRAL";
}

// Color for a direction, shared so every surface colors calls/buys green and
// puts/sells red identically. NEUTRAL/HOLD is muted.
export function directionColor(direction, assetClass) {
  const label = directionLabel(direction, assetClass);
  if (label === "CALLS" || label === "LONG" || label === "BUY") return "#4FA97B";
  if (label === "PUTS" || label === "SHORT" || label === "SELL") return "#C9576B";
  return "#9DB4CC";
}

// ── HORIZON BUCKETING ────────────────────────────────────────────────────────
// Maps a chart interval onto the cadence bucket the feed filters by.
//
// V14: this is ASSET-CLASS AWARE. The flat map sent options 4h/1d into the
// "weekly" bucket — i.e. presented as multi-week swings — which contradicts the
// short-dated mandate: the options engine targets THIS WEEK's expiry (0–5 DTE,
// see contractGuidance in signalEngine). A daily chart is still useful ANALYSIS
// context for a 0–5 DTE trade, so we keep the interval available and instead cap
// how the resulting signal is CLASSIFIED. Futures are intraday-only by their own
// interval cap, so they never exceed daily either.
const BASE_BUCKET = {
  "1min": "daily", "5min": "daily", "15min": "daily", "1h": "daily",
  "4h": "weekly", "1d": "weekly", "1w": "monthly", "1mo": "yearly",
};
export function bucketFor(interval, assetClass) {
  const base = BASE_BUCKET[interval] || "daily";
  // Options and futures are short-horizon instruments — never file them under a
  // multi-week/month/year cadence no matter what chart timeframe was analyzed.
  if (assetClass === "options" || assetClass === "futures") return "daily";
  return base;
}

// For equity, NEUTRAL is a real, showable stance (HOLD) — unlike options/futures
// where NEUTRAL means "no directional edge, nothing to show".
export function isShowableDirection(direction, assetClass) {
  const d = String(direction || "").toUpperCase();
  if (assetClass === "equity") return true; // BUY / HOLD / SELL are all meaningful
  return d === "LONG" || d === "SHORT";
}
