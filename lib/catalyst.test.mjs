/**
 * Catalyst capture. The scoring itself is newsImpact's and already tested; what
 * matters here is that "no catalyst" and "nobody looked" never collapse into
 * the same value, and that a feed outage cannot reach the engine.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mergeCatalyst, symbolCatalyst, macroCatalyst } from "./catalyst.js";

test("no key means not looked, not 'no catalyst'", async () => {
  // The distinction the whole module rests on. A zero that cannot tell these
  // apart becomes "quiet market" in every downstream slice.
  const r = await symbolCatalyst("AAPL", null);
  assert.equal(r.looked, false);
  assert.equal(r.catalyst_present, false);
  assert.equal(await macroCatalyst(null).then((m) => m.looked), false);
});

test("merge reports checked=false when neither half looked", () => {
  const m = mergeCatalyst({ looked: false }, { looked: false });
  assert.equal(m.catalyst_checked, false);
  assert.equal(m.catalyst_present, false);
});

test("merge reports checked=true if either half looked", () => {
  assert.equal(mergeCatalyst({ looked: true }, { looked: false }).catalyst_checked, true);
  assert.equal(mergeCatalyst({ looked: false }, { looked: true }).catalyst_checked, true);
});

test("symbol and macro catalysts stay separable after merging", () => {
  // "The market was moving" and "this ticker was moving" call for completely
  // different reads, so the merged flag must not erase which it was.
  const m = mergeCatalyst({ catalyst_present: true, looked: true }, { catalyst_present: false, looked: true });
  assert.equal(m.symbol_catalyst, true);
  assert.equal(m.macro_catalyst, false);
  assert.equal(m.catalyst_present, true);
});

test("the loudest headline wins, whichever side it came from", () => {
  const m = mergeCatalyst(
    { max_impact: 30, top_headline: "quiet ticker note", looked: true },
    { max_impact: 88, top_headline: "FOMC emergency decision", looked: true },
  );
  assert.equal(m.max_impact, 88);
  assert.match(m.top_headline, /FOMC/);
});

test("counts add across both feeds", () => {
  const m = mergeCatalyst(
    { headline_count: 12, breaking_count: 1, looked: true },
    { headline_count: 30, breaking_count: 2, looked: true },
  );
  assert.equal(m.news_count, 42);
  assert.equal(m.breaking_count, 3);
});

test("live_speech survives from either side", () => {
  assert.equal(mergeCatalyst({ live_speech: false }, { live_speech: true }).live_speech, true);
});

test("merging nulls never throws", () => {
  // This runs inside signal generation. It has to be total.
  for (const [a, b] of [[null, null], [undefined, {}], [{}, undefined]]) {
    assert.equal(mergeCatalyst(a, b).catalyst_present, false);
  }
});
