// lib/chop.js — V13.6 market chop / instability detection.
//
// Whipsaw — a choppy, directionless-but-volatile market — is where traders get
// stopped out repeatedly (exactly what happened to Gio's paper account). This
// module measures it with the Choppiness Index and turns it into a simple
// "is the market tradeable right now" verdict that both the cron (to halt new
// FIRE signals) and the UI (to show a stand-down banner) consume.

import { getCandles } from "./marketData";

// Choppiness Index (E.W. Dreiss). Range 0–100:
//   high (> ~61.8) → sideways / consolidating / whipsaw — hard to trade
//   low  (< ~38.2) → strong trend
// Standard Fibonacci thresholds. Computed from 1-bar true ranges vs the total
// high-low range over the window: lots of intrabar movement inside a tight net
// range = chop.
export function choppinessIndex(candles, n = 14) {
  if (!candles || candles.length < n + 1) return null;
  let trSum = 0;
  for (let i = candles.length - n; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    trSum += Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  const window = candles.slice(-n);
  const maxH = Math.max(...window.map((c) => c.high));
  const minL = Math.min(...window.map((c) => c.low));
  const range = maxH - minL;
  if (!(range > 0)) return 100; // a flat / zero-range window is maximally "choppy"
  const ci = (100 * Math.log10(trSum / range)) / Math.log10(n);
  return Math.max(0, Math.min(100, Math.round(ci * 10) / 10));
}

export const CHOP_THRESHOLD = 61.8;

// Broad-market tradability from the index benchmarks (SPY + QQQ). Best-effort and
// cached ~2 min: on ANY failure it returns tradeable, so a data hiccup can never
// wrongly halt the whole product. `choppy` is the flag the cron + UI act on.
let _cache = { at: 0, value: null };
export async function marketRegime({ force = false } = {}) {
  if (!force && _cache.value && Date.now() - _cache.at < 120_000) return _cache.value;

  const symbols = ["SPY", "QQQ"];
  const cis = [];
  for (const sym of symbols) {
    try {
      const { candles } = await getCandles(sym, "15min");
      const ci = choppinessIndex(candles, 14);
      if (ci != null) cis.push({ sym, ci });
    } catch { /* skip this benchmark, use whatever we got */ }
  }

  let value;
  if (!cis.length) {
    value = { choppy: false, ci: null, label: "unknown", detail: "regime data unavailable", at: Date.now() };
  } else {
    const avg = Math.round((cis.reduce((s, x) => s + x.ci, 0) / cis.length) * 10) / 10;
    const choppy = avg >= CHOP_THRESHOLD;
    value = {
      choppy,
      ci: avg,
      label: choppy ? "choppy" : avg >= 50 ? "mixed" : "trending",
      detail: cis.map((x) => `${x.sym} ${x.ci}`).join(" · "),
      benchmarks: cis,
      at: Date.now(),
    };
  }
  _cache = { at: Date.now(), value };
  return value;
}
