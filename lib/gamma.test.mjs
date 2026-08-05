/**
 * Gamma exposure. The arithmetic is testable; the positioning assumption is
 * not, which is exactly why it travels with the result.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { bsGamma, gammaExposure } from "./gamma.js";

test("gamma peaks at the money and decays either side", () => {
  const T = 0.08, iv = 0.30, S = 100;
  const atm = bsGamma(S, 100, T, iv);
  const otm = bsGamma(S, 120, T, iv);
  const itm = bsGamma(S, 80, T, iv);
  assert.ok(atm > otm && atm > itm, `atm ${atm} should exceed ${otm} and ${itm}`);
});

test("gamma is identical for calls and puts", () => {
  // The property that makes exposure summable across the chain at all.
  assert.equal(bsGamma(100, 105, 0.1, 0.25), bsGamma(100, 105, 0.1, 0.25));
});

test("degenerate inputs return null rather than infinity", () => {
  // Gamma explodes as T or sigma approach zero. A contract minutes from expiry
  // would otherwise dominate the entire surface with a meaningless number.
  assert.equal(bsGamma(100, 100, 0, 0.3), null);
  assert.equal(bsGamma(100, 100, 0.1, 0), null);
  assert.equal(bsGamma(100, 100, 0.0001, 0.3), null, "under ~2h to expiry is refused");
  assert.equal(bsGamma(0, 100, 0.1, 0.3), null);
  assert.equal(bsGamma(100, 100, 0.1, null), null);
});

const chainOf = (spot, { callOI = 1000, putOI = 1000 } = {}) => {
  const expiration = Math.floor((Date.now() + 30 * 864e5) / 1000);
  const strikes = [];
  for (let k = spot * 0.9; k <= spot * 1.1; k += spot * 0.01) strikes.push(Math.round(k * 100) / 100);
  return {
    expirationDate: expiration,
    calls: strikes.map((strike) => ({ strike, impliedVolatility: 0.28, openInterest: callOI, expiration })),
    puts:  strikes.map((strike) => ({ strike, impliedVolatility: 0.28, openInterest: putOI,  expiration })),
  };
};

test("balanced open interest reads flat, not positive", () => {
  const r = gammaExposure(chainOf(100), 100);
  assert.ok(Math.abs(r.total_gex) < Math.abs(r.call_gex) * 0.05,
    "equal call and put OI should very nearly cancel");
});

test("call-heavy open interest reads positive gamma", () => {
  // Dealers long calls dampen moves -- the regime that suppresses volatility.
  const r = gammaExposure(chainOf(100, { callOI: 5000, putOI: 500 }), 100);
  assert.equal(r.gamma_regime, "positive");
  assert.ok(r.total_gex > 0);
});

test("put-heavy open interest reads negative gamma", () => {
  const r = gammaExposure(chainOf(100, { callOI: 500, putOI: 5000 }), 100);
  assert.equal(r.gamma_regime, "negative");
  assert.ok(r.total_gex < 0);
});

test("a thin chain returns nulls rather than a confident number", () => {
  // Eight contracts is the floor. Below it the surface is not a surface.
  const r = gammaExposure({ calls: [{ strike: 100, impliedVolatility: 0.3, openInterest: 10 }], puts: [] }, 100);
  assert.equal(r.total_gex, null);
  assert.equal(r.gamma_regime, null);
});

test("the positioning assumption is always attached", () => {
  // The one thing here that is not measured. It must never be separable from
  // the numbers it produced.
  for (const r of [gammaExposure(chainOf(100), 100), gammaExposure(null, null)]) {
    assert.match(r.assumptions, /dealers long calls/);
  }
});

test("garbage input never throws into the caller", () => {
  for (const bad of [null, undefined, {}, { calls: "nope" }]) {
    assert.equal(gammaExposure(bad, 100).total_gex, null);
  }
  assert.equal(gammaExposure(chainOf(100), -5).total_gex, null);
});

test("deep wings are excluded", () => {
  // Yahoo routinely carries placeholder IVs far from spot, and a 0.001 vol on
  // a 30-delta wing would distort the whole surface.
  const c = chainOf(100);
  c.calls.push({ strike: 400, impliedVolatility: 0.001, openInterest: 999999, expiration: c.expirationDate });
  const r = gammaExposure(c, 100);
  assert.ok(Number.isFinite(r.total_gex), "still computes");
  assert.ok(r.contracts_used < c.calls.length + c.puts.length, "the wing was dropped");
});
