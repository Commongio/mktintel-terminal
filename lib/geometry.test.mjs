/**
 * Plan geometry.
 *
 * The bug this pins produced 23 of the 24 wins on record. An AAPL LONG was
 * written with entry 308.91, stop 319.35 (ABOVE entry) and t1 293.25 (BELOW
 * it), because `lastSwingLow` sat above the current price -- price had already
 * broken through it -- which makes riskAmt negative and mirrors the whole plan.
 *
 * signalLifecycle.js:79 then tests t1 BEFORE the stop against live price, so
 * the target was already satisfied at the moment of writing and the signal
 * graded itself `won` within nine seconds. Re-emitted every cron tick, it
 * manufactured a win each time.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { geometryValid } from "./geometry.js";

test("the exact AAPL plan that produced 23 phantom wins is refused", () => {
  assert.equal(geometryValid("LONG", { entry: 308.91, stop: 319.35, t1: 293.25 }), false);
});

test("a well-formed LONG passes", () => {
  assert.equal(geometryValid("LONG", { entry: 100, stop: 98, t1: 103 }), true);
});

test("a well-formed SHORT passes", () => {
  assert.equal(geometryValid("SHORT", { entry: 100, stop: 102, t1: 97 }), true);
});

test("a LONG's plan on a SHORT is refused, and the reverse", () => {
  // Direction and geometry disagreeing is the same class of fault, arriving
  // from the other side.
  assert.equal(geometryValid("SHORT", { entry: 100, stop: 98, t1: 103 }), false);
  assert.equal(geometryValid("LONG", { entry: 100, stop: 102, t1: 97 }), false);
});

test("a stop exactly at entry is refused", () => {
  // Zero risk is not a trade, and it makes R zero -- every R-multiple
  // downstream becomes a division by zero.
  assert.equal(geometryValid("LONG", { entry: 100, stop: 100, t1: 103 }), false);
});

test("a target exactly at entry is refused", () => {
  assert.equal(geometryValid("LONG", { entry: 100, stop: 98, t1: 100 }), false);
});

test("missing or non-finite numbers are refused, never coerced", () => {
  for (const plan of [
    { entry: 100, stop: null, t1: 103 },
    { entry: 100, stop: 98, t1: undefined },
    { entry: NaN, stop: 98, t1: 103 },
    { entry: "100", stop: 98, t1: 103 },
  ]) assert.equal(geometryValid("LONG", plan), false, JSON.stringify(plan));
});

test("NEUTRAL never yields a valid plan", () => {
  assert.equal(geometryValid("NEUTRAL", { entry: 100, stop: 98, t1: 103 }), false);
});

test("a null plan is refused rather than throwing", () => {
  assert.equal(geometryValid("LONG", null), false);
});
