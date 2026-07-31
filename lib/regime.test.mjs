/**
 * Regime capture. Pure functions only — the quote fetch is not tested here
 * because what matters about it is that it returns nulls instead of throwing,
 * which is a property of the call site, not of a value.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { sessionOf, instrumentRegime, buildRegime } from "./regime.js";

const at = (iso) => new Date(iso);

test("regular session is bounded by the bell, not by the hour", () => {
  // 14:30 UTC = 09:30 ET in summer.
  assert.equal(sessionOf(at("2026-07-30T14:30:00Z")).session, "regular");
  assert.equal(sessionOf(at("2026-07-30T19:59:00Z")).session, "regular");
  assert.equal(sessionOf(at("2026-07-30T20:01:00Z")).session, "after");
});

test("minutes_from_open is negative before the bell", () => {
  // Clamping pre-market to zero would merge "30 minutes early" with "at the
  // open", and those are different regimes.
  // 13:30Z = 09:30 EDT, the bell. 13:00Z is half an hour before it.
  assert.equal(sessionOf(at("2026-07-30T13:00:00Z")).minutes_from_open, -30);
  assert.equal(sessionOf(at("2026-07-30T13:30:00Z")).minutes_from_open, 0);
});

test("weekends are closed regardless of clock time", () => {
  assert.equal(sessionOf(at("2026-08-01T15:00:00Z")).session, "closed");
  assert.equal(sessionOf(at("2026-08-01T15:00:00Z")).minutes_from_open, null);
});

test("DST is handled by the timezone, not an offset", () => {
  // January: 14:30 UTC is 09:30 EST, still the open. A hardcoded -4 would put
  // this in pre-market for half the year.
  assert.equal(sessionOf(at("2026-01-15T14:30:00Z")).session, "regular");
});

const candle = (o, h, l, c, v) => ({ open: o, high: h, low: l, close: c, volume: v });

test("too few candles yields nulls, never a number from thin data", () => {
  const r = instrumentRegime([candle(1, 2, 0.5, 1.5, 100)]);
  assert.equal(r.atr_pct, null);
  assert.equal(r.dollar_volume_rel, null);
});

test("atr_pct is a percentage of price, so it compares across symbols", () => {
  const flat = Array.from({ length: 25 }, () => candle(100, 101, 99, 100, 1000));
  const r = instrumentRegime(flat);
  // 2-point range on a 100 close.
  assert.ok(Math.abs(r.atr_pct - 2) < 0.01, `expected ~2, got ${r.atr_pct}`);
});

test("a volume spike shows up as dollar_volume_rel above 1", () => {
  const bars = Array.from({ length: 25 }, () => candle(100, 101, 99, 100, 1000));
  bars[bars.length - 1] = candle(100, 101, 99, 100, 5000);
  assert.ok(instrumentRegime(bars).dollar_volume_rel > 3);
});

test("malformed candles return nulls rather than throwing into the engine", () => {
  const junk = Array.from({ length: 25 }, () => ({}));
  const r = instrumentRegime(junk);
  assert.equal(r.atr_pct, null);
});

test("buildRegime survives both halves being absent", () => {
  // A signal with no regime is still a signal. This must never throw.
  const r = buildRegime(null, null, at("2026-07-30T14:30:00Z"));
  assert.equal(r.session, "regular");
  assert.equal(r.vix_level, null);
  assert.equal(r.atr_pct, null);
  assert.ok(r.captured_at);
});
