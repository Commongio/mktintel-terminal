/**
 * Plan geometry validation.
 *
 * Its own module, with no imports, for two reasons: it is pure and should be
 * testable without dragging in the market-data layer, and it needs to be
 * callable from any write path that persists a signal — not only from the
 * engine that happens to build one first.
 *
 * WHAT THIS PREVENTS. signalEngine derives the stop from `lastSwingLow` on a
 * LONG. When price has already broken below that level, the swing low sits
 * ABOVE the current price, so `riskAmt = price - stop` is negative and
 * `t1 = price + riskAmt * 1.5` lands BELOW entry. The plan is mirrored.
 *
 * That alone would be a bad trade. What makes it corrupting is the grader:
 * signalLifecycle.js:79 tests t1 BEFORE the stop against live price, so a
 * target already below the current price is satisfied the instant the row is
 * written. One AAPL setup did this and graded itself `won` nine seconds after
 * creation, then again on every cron tick — 23 of the 24 wins on record came
 * from that single inverted signal, and every calibration number computed from
 * them was arithmetic rather than edge.
 */

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Is this plan the shape its direction claims?
 *
 * Strict inequalities throughout. A stop exactly at entry is not a tight trade,
 * it is a zero-risk one — which makes R zero and turns every R-multiple
 * downstream into a division by zero.
 */
export function geometryValid(direction, plan) {
  if (!plan) return false;
  const { entry, stop, t1 } = plan;
  if (![entry, stop, t1].every(isNum)) return false;
  if (direction === "LONG") return stop < entry && t1 > entry;
  if (direction === "SHORT") return stop > entry && t1 < entry;
  return false;
}
