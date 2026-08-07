/**
 * Every theme, against a stub canvas.
 *
 * The three properties checked here are the ones that fail silently in a
 * browser -- a theme that mutates state looks fine until the first paint
 * double-advances it, and an op count that blows the budget shows up as a warm
 * laptop rather than an error.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { CANVAS_THEMES, makeRgba, hashRandom } from "./registry.js";

const stubGrad = { addColorStop() {} };
function makeCtx(counter) {
  return new Proxy({}, {
    get(_, k) {
      if (k === "createLinearGradient" || k === "createRadialGradient") return () => (counter.n++, stubGrad);
      if (k === "fill" || k === "fillRect" || k === "stroke" || k === "arc") return () => counter.n++;
      return () => {};
    },
    set() { return true; },
  });
}

const SIZES = [[1920, 1080], [1280, 800], [3840, 2160]];
const TIMES = [0, 16.7, 1000, 53_000, 67_000, 91_000, 500_000];

for (const theme of CANVAS_THEMES) {
  test(`${theme.id}: init and draw without throwing, at every size`, () => {
    for (const [w, h] of SIZES) {
      const state = theme.init ? theme.init({ w, h, accent: "#4C9E92" }) : {};
      const ctx = makeCtx({ n: 0 });
      for (const now of TIMES) {
        theme.draw({ ctx, w, h, now, accent: "#4C9E92", state, rgba: makeRgba("#4C9E92") });
      }
    }
  });

  test(`${theme.id}: draw() does not mutate state`, () => {
    // draw() is called once directly for the guaranteed first paint and then
    // from rAF. Anything mutating advances the animation twice on frame one,
    // and a resize would compound it.
    const state = theme.init ? theme.init({ w: 1920, h: 1080, accent: "#4C9E92" }) : {};
    const before = JSON.stringify(state);
    const ctx = makeCtx({ n: 0 });
    for (const now of TIMES) {
      theme.draw({ ctx, w: 1920, h: 1080, now, accent: "#4C9E92", state, rgba: makeRgba("#4C9E92") });
    }
    assert.equal(JSON.stringify(state), before, "draw() mutated its state");
  });

  test(`${theme.id}: stays inside the per-frame op budget`, () => {
    // A proxy for the 3ms target. Not a timing test -- timing on a CI box
    // means nothing -- but an op count that doubles is a real regression and
    // this catches it.
    const state = theme.init ? theme.init({ w: 1920, h: 1080, accent: "#4C9E92" }) : {};
    const counter = { n: 0 };
    theme.draw({ ctx: makeCtx(counter), w: 1920, h: 1080, now: 12_345, accent: "#4C9E92", state, rgba: makeRgba("#4C9E92") });
    assert.ok(counter.n < 900, `${theme.id} issued ${counter.n} draw ops in one frame`);
  });

  test(`${theme.id}: init is deterministic`, () => {
    // A resize re-runs init. If it used Math.random() the field would reshuffle
    // every time a window edge moved, which reads as the theme restarting.
    const a = theme.init ? theme.init({ w: 1920, h: 1080, accent: "#4C9E92" }) : {};
    const b = theme.init ? theme.init({ w: 1920, h: 1080, accent: "#4C9E92" }) : {};
    assert.equal(JSON.stringify(a), JSON.stringify(b), `${theme.id} init is not deterministic`);
  });
}

test("ids are unique and stable-looking", () => {
  // Ids are persisted in localStorage; a collision would make two themes
  // indistinguishable to the resolver.
  const ids = CANVAS_THEMES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate theme id");
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9]*$/, `${id} should be lowercase alphanumeric`);
});

test("hashRandom is deterministic and in range", () => {
  for (let i = 0; i < 200; i++) {
    const v = hashRandom(i, 3);
    assert.ok(v >= 0 && v < 1, `out of range at ${i}: ${v}`);
    assert.equal(v, hashRandom(i, 3));
  }
});
