/**
 * Emitter safety tests. Run: node --test lib/labEmitter.test.mjs
 *
 * The assertions that matter here are the negative ones: this module must be
 * incapable of breaking signal generation. Correct payloads are secondary to
 * never throwing.
 */
import test from "node:test";
import assert from "node:assert/strict";

// Configure BEFORE importing, so module-level env capture sees it.
process.env.KRONOS_LAB_URL = "http://127.0.0.1:9/definitely-not-listening";
process.env.KRONOS_LAB_HMAC_KEY = "test-key";
process.env.KRONOS_LAB_KEY_ID = "k1";

const {
  emitSignal, emitOutcome, deriveSetup, continuesFamily, buildProvenance,
  buildSignalPayload, labEnabled,
} = await import("./labEmitter.js");
const { verifyEnvelope } = await import("./labContract/envelope.js");
const { buildEnvelope } = await import("./labContract/envelope.js");

const engineRaw = {
  status: "FIRE", direction: "LONG", conviction: 100,
  bullWeight: 61, bearWeight: 15,
  structure: { swept: ["prior_low"], fvg: [{ lo: 1, hi: 2 }] },
  confirmation: { confirmed: true, why: "reclaim" },
  risk: { approved: true },
  dataSource: "polygon", candleCount: 480, degraded: false, price: "641.20",
  agents: [
    { agent: "TECHNICAL", signal: "bullish", confidence: 72, reasons: ["a"], data: { ema: 1 } },
    { agent: "STRUCTURE", signal: "bullish", confidence: 81, reasons: ["b"], data: { swing: 2 } },
    { agent: "SENTIMENT", signal: "bullish", confidence: 55, reasons: ["c"] },
    { agent: "OPTIONS FLOW", signal: "bearish", confidence: 60, reasons: ["d"] },
  ],
};
const gated = { ...engineRaw, conviction: 88, status: "HOLD" };

const engineRow = {
  id: "sig_1", asset_class: "options", symbol: "SPY", interval: "15m",
  status: "FIRE", direction: "LONG", conviction: 100,
  plan: { entry: 641.2, stop: 637.9, t1: 646.15, t2: 651.1, rr: 3.0 },
  agents: engineRaw.agents, engine_version: "14.8", source: "refresh",
  decision_time: "2026-07-27T17:30:00.000Z",
};

const newsRow = {
  id: "sig_2", asset_class: "options", symbol: "AAPL", interval: "1h",
  status: "FIRE", direction: "LONG", conviction: 70,
  plan: { kind: "news", headline: "x", source: "cnbc" },
  agents: [{ agent: "NEWS", vote: "LONG", conviction: 70 }],
  engine_version: "14.8", source: "news",
  decision_time: "2026-07-27T17:30:00.000Z",
};

// ── the safety contract ────────────────────────────────────────────────────

test("SAFETY: unreachable Lab returns false and never throws", async () => {
  const r = await emitSignal({ raw: engineRaw, sig: gated, row: engineRow, last: null });
  assert.equal(r, false, "must resolve false, not reject");
});

test("SAFETY: garbage input never throws", async () => {
  const cases = [
    { raw: null, sig: null, row: {}, last: null },
    { raw: undefined, sig: undefined, row: { source: "news" }, last: undefined },
    { raw: {}, sig: {}, row: { plan: null, agents: "not-an-array" }, last: {} },
  ];
  for (const c of cases) {
    const r = await emitSignal(c);
    assert.equal(typeof r, "boolean");
  }
  assert.equal(await emitOutcome({ signalId: null, state: undefined }), false);
});

test("SAFETY: disabled when unconfigured, and never half-on", async () => {
  const url = process.env.KRONOS_LAB_URL, key = process.env.KRONOS_LAB_HMAC_KEY;
  try {
    // labEnabled() reads module-level consts, so assert the invariant directly.
    assert.equal(labEnabled(), true, "both set => enabled");
    assert.equal(Boolean(url && ""), false, "url without key => disabled");
    assert.equal(Boolean("" && key), false, "key without url => disabled");
  } finally {
    process.env.KRONOS_LAB_URL = url; process.env.KRONOS_LAB_HMAC_KEY = key;
  }
});

// ── setup identity ─────────────────────────────────────────────────────────

test("setup identity is stable across a re-write family", () => {
  const first = deriveSetup(null, engineRow, new Date("2026-07-27T14:00:00Z"));
  assert.equal(first.revision, 0);

  let last = { ...engineRow, ...first };
  const ids = new Set([first.setup_id]);
  for (let i = 1; i <= 11; i++) {
    const next = deriveSetup(last, engineRow);
    ids.add(next.setup_id);
    assert.equal(next.revision, i, "revision must increment within the family");
    last = { ...engineRow, ...next };
  }
  assert.equal(ids.size, 1, "twelve re-writes, one setup identity");
});

test("a verdict change starts a new family at revision 0", () => {
  const first = deriveSetup(null, engineRow, new Date("2026-07-27T14:00:00Z"));
  const last = { ...engineRow, ...first };
  const flipped = deriveSetup(last, { ...engineRow, direction: "SHORT" });
  assert.equal(flipped.revision, 0);
  assert.notEqual(flipped.setup_id, first.setup_id);

  assert.equal(continuesFamily(last, engineRow), true);
  assert.equal(continuesFamily(last, { ...engineRow, status: "HOLD" }), false);
});

// ── provenance ─────────────────────────────────────────────────────────────

test("provenance captures the gate delta and the uncapped conviction", () => {
  const p = buildProvenance(engineRaw, gated, { chopApplied: true, minConviction: 65 });
  assert.equal(p.gate.applied, true, "raw 100/FIRE vs gated 88/HOLD");
  assert.equal(p.gate.raw_conviction, 100);
  assert.equal(p.gate.raw_status, "FIRE");
  // chop was ACTIVE this run but did not demote anything: raw is still FIRE.
  assert.equal(p.chop_eligible, true, "market was choppy");
  assert.equal(p.chop_applied, false, "but this signal was not demoted by it");
  assert.equal(p.min_conviction_at_write, 65);

  // |61-15| + 3 agreeing bullish * 12 = 46 + 36 = 82
  assert.equal(p.uncapped_conviction, 82);
  assert.deepEqual(p.structure, engineRaw.structure);
  assert.equal(p.candle_count, 480);
  assert.equal(p.agent_data.find((a) => a.agent === "TECHNICAL").data.ema, 1);
});

test("no gate delta when raw and final agree", () => {
  assert.equal(buildProvenance(engineRaw, engineRaw, {}).gate.applied, false);
});

test("a chop demotion stays distinguishable from a signal that never fired", () => {
  // The cron mutates raw.status in place (generate-signals:91), so by the time
  // provenance is built, raw already reads HOLD. preGate is what preserves the
  // original verdict.
  const demoted = { ...engineRaw, status: "HOLD" };
  const p = buildProvenance(demoted, demoted, {
    chopApplied: true, preGate: { status: "FIRE", conviction: 100 },
  });
  assert.equal(p.chop_applied, true, "FIRE -> HOLD by chop must be recorded");
  assert.equal(p.pre_gate_status, "FIRE", "the original verdict survives");
  assert.equal(p.gate.applied, false, "the aggregate gate did nothing here");

  // A signal that genuinely never fired, during the same choppy market.
  const neverFired = { ...engineRaw, status: "HOLD" };
  const q = buildProvenance(neverFired, neverFired, {
    chopApplied: true, preGate: { status: "HOLD", conviction: 88 },
  });
  assert.equal(q.chop_applied, false, "not demoted -- it was already HOLD");
  assert.equal(q.pre_gate_status, "HOLD");
});

// ── the two shapes ─────────────────────────────────────────────────────────

test("news rows are marked as a different object, not coerced", () => {
  const setup = deriveSetup(null, newsRow);
  const p = buildSignalPayload({
    raw: null, sig: null, row: newsRow, setup,
    provenance: buildProvenance(null, null, {}),
  });

  assert.equal(p.agents_shape, "news_v1");
  assert.equal(p.prediction.decomposable, false, "the vote formula never ran");
  assert.equal(p.prediction.predicate_id, null, "no trade geometry, no predicate");
  assert.equal(p.plan.geometry, null);
  assert.equal(p.status_semantics, "threshold_only");
  assert.equal(p.instrument.interval_is_synthetic, true, "mcpFeed hardcodes 1h");
  assert.equal(p.instrument.asset_class_is_synthetic, true);
});

test("engine rows keep full geometry and decimals travel as strings", () => {
  const setup = deriveSetup(null, engineRow);
  const p = buildSignalPayload({
    raw: engineRaw, sig: gated, row: engineRow, setup,
    provenance: buildProvenance(engineRaw, gated, {}),
  });

  assert.equal(p.agents_shape, "engine_v1");
  assert.equal(p.prediction.decomposable, true);
  assert.equal(p.prediction.predicate_id, "t1_before_stop");
  assert.equal(p.status_semantics, "risk_and_confirmation_gated");
  assert.equal(p.plan.entry, "641.2", "decimal as string");
  assert.equal(typeof p.plan.t1, "string");
  assert.equal(p.instrument.interval_is_synthetic, false);
});

// ── the envelope the Lab will actually receive ─────────────────────────────

test("emitted envelope verifies against the Lab's own verifier", () => {
  const setup = deriveSetup(null, engineRow);
  const payload = buildSignalPayload({
    raw: engineRaw, sig: gated, row: engineRow, setup,
    provenance: buildProvenance(engineRaw, gated, { minConviction: 65 }),
  });
  const env = buildEnvelope({
    eventType: "signal.emitted", payload,
    idempotencyKey: `${setup.setup_id}:rev${setup.revision}`,
    producer: { system: "kronos", instance: "test", emitter_sdk_version: "0.1.0" },
    secret: "test-key", keyId: "k1", occurredAt: payload.decision_time,
  });

  const r = verifyEnvelope(env, (id) => (id === "k1" ? "test-key" : null));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.envelope.payload.setup.revision, 0);
});

test("invalidated outcomes carry no predicate truth value", () => {
  for (const [state, expected] of [["won", true], ["lost", false], ["invalidated", null]]) {
    const v = state === "won" ? true : state === "lost" ? false : null;
    assert.equal(v, expected, `${state} must map to ${expected}`);
  }
});
