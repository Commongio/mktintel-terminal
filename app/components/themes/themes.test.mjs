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

// ── shader themes ───────────────────────────────────────────────────────────
// A WebGL theme cannot be exercised here: there is no GL context in Node, and
// stubbing one would only assert that the stub was called. What CAN be checked
// without a GPU is the source itself, and these are the failures that actually
// happen — a missing uniform or an unbalanced brace produces a black screen
// with the error buried in a getShaderInfoLog nobody reads.
const GL_THEMES = CANVAS_THEMES.filter((t) => t.kind === "webgl");
const TWOD_THEMES = CANVAS_THEMES.filter((t) => t.kind !== "webgl");

for (const theme of GL_THEMES) {
  test(`${theme.id}: shader sources are well formed`, async () => {
    const mod = await import(`./${theme.id}.js`);
    const sources = mod._SHADERS || (mod._FRAG ? [mod._FRAG] : []);
    assert.ok(sources.length > 0, "no shader source exported");

    for (const src of sources) {
      assert.ok(typeof src === "string" && src.length > 80, "empty shader source");
      // Balanced delimiters. An unbalanced brace is the most common way a
      // hand-edited shader breaks, and GLSL gives no line context worth reading.
      for (const [open, close] of [["{", "}"], ["(", ")"]]) {
        const o = src.split(open).length - 1, c = src.split(close).length - 1;
        assert.equal(o, c, `unbalanced ${open}${close}: ${o} vs ${c}`);
      }
      assert.match(src, /void\s+main\s*\(/, "no main()");
      // A fragment shader must write gl_FragColor; a vertex shader gl_Position.
      assert.ok(/gl_FragColor\s*=/.test(src) || /gl_Position\s*=/.test(src),
        "main() writes neither gl_FragColor nor gl_Position");
    }

    // Every FRAGMENT shader needs the guarded precision prefix. highp is not
    // guaranteed in fragment shaders, and naming it unconditionally fails to
    // COMPILE where it is absent rather than degrading — a black screen.
    // Vertex shaders get highp by default and need no prefix.
    for (const src of sources) {
      if (!/gl_FragColor\s*=/.test(src)) continue;
      assert.match(src, /GL_FRAGMENT_PRECISION_HIGH/, "fragment precision is not guarded");
    }

    // Every uniform declared anywhere must be one the theme asks the host to
    // resolve. A typo yields a null location, and setting a null uniform is
    // SILENTLY IGNORED by WebGL — the shader then reads zero forever, with no
    // error at compile, link or draw.
    const all = sources.join("\n");
    const declared = new Set([...all.matchAll(/^\s*uniform\s+\w+\s+(\w+)\s*;/gm)].map((m) => m[1]));
    assert.ok(declared.size > 0, "no uniforms declared");
    const themeSrc = theme.init.toString() + theme.draw.toString();
    for (const name of declared) {
      assert.ok(themeSrc.includes(name), `${theme.id} declares uniform '${name}' but never sets it`);
    }

    // Varyings must agree across the two stages. A varying read by the
    // fragment shader but never declared in the vertex shader is a LINK
    // error, which surfaces as a blank program rather than a compile message.
    const varyingsIn = (s) => new Set([...s.matchAll(/^\s*varying\s+\w+\s+(\w+)\s*;/gm)].map((m) => m[1]));
    const vert = sources.find((s) => /gl_Position\s*=/.test(s));
    const frags = sources.filter((s) => /gl_FragColor\s*=/.test(s));
    if (vert) {
      const declaredVert = varyingsIn(vert);
      for (const f of frags) {
        // Only the fragment shader paired with this vertex shader can use
        // varyings; a fullscreen pass has none, so an empty set passes.
        for (const v of varyingsIn(f)) {
          assert.ok(declaredVert.has(v) || varyingsIn(f).size === 0,
            `fragment shader reads varying '${v}' that the vertex shader never declares`);
        }
      }
    }
  });

  test(`${theme.id}: releases GL objects but NOT the context`, () => {
    assert.equal(typeof theme.destroy, "function", `${theme.id} must implement destroy`);
    const calls = [];
    const gl = new Proxy({}, { get: (_, k) => (...a) => { calls.push(k); return k === "getExtension" ? { loseContext() { calls.push("loseContext"); } } : undefined; } });
    theme.destroy({ programs: [{}], buffers: [{}], u: {} }, gl);
    assert.ok(calls.includes("deleteProgram"), "program not deleted");
    assert.ok(calls.includes("deleteBuffer"), "buffer not deleted");
    // Attribute arrays are CONTEXT state and outlive the buffers they point
    // at. Freeing a buffer while an array still references it leaves the array
    // pointing at a dead object, and the next draw is INVALID_OPERATION — which
    // is what a StrictMode remount on the same canvas actually produced. The
    // disable must come BEFORE the delete.
    const disableAt = calls.indexOf("disableVertexAttribArray");
    const deleteAt = calls.indexOf("deleteBuffer");
    assert.ok(disableAt >= 0, "vertex attrib arrays never disabled");
    assert.ok(disableAt < deleteAt, "attrib arrays must be disabled BEFORE their buffers are deleted");
    // The context must SURVIVE. React StrictMode runs every effect twice in
    // development, so the second mount lands on the same canvas — destroying
    // the context in cleanup leaves a dead one that getContext still returns,
    // and every compile against it fails with a null info log. A valid shader
    // then reports "compile failed: null". That is not hypothetical; it is
    // what this cost to find. Context lifetime belongs to the canvas element,
    // which the host keys on theme id.
    assert.ok(!calls.includes("loseContext"),
      `${theme.id} destroyed the GL context; it must outlive cleanup so a StrictMode remount can reuse the canvas`);
  });
}

for (const theme of TWOD_THEMES) {
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

  test(`${theme.id}: restores context state it changed`, () => {
    // The host reuses ONE context for the life of the theme and only calls
    // clearRect between frames, so anything left set on it persists into the
    // next frame -- and into whatever the next theme draws.
    //
    // globalCompositeOperation is the dangerous one. `ambient` draws additively
    // ("lighter"); left set, the next frame's opaque background fill blends
    // additively over the last, and the screen ramps to white in about a
    // second. That is invisible to the op counter and to the purity check,
    // which is why it needs its own invariant.
    const stateOf = { globalCompositeOperation: "source-over", globalAlpha: 1 };
    const ctx = new Proxy({}, {
      get(_, k) {
        if (k === "createLinearGradient" || k === "createRadialGradient") return () => stubGrad;
        if (k === "save") return () => { saved.push({ ...stateOf }); };
        if (k === "restore") return () => { Object.assign(stateOf, saved.pop() ?? {}); };
        if (k in stateOf) return stateOf[k];
        return () => {};
      },
      set(_, k, v) { if (k in stateOf) stateOf[k] = v; return true; },
    });
    const saved = [];
    const state = theme.init ? theme.init({ w: 1920, h: 1080, accent: "#4C9E92" }) : {};
    for (const now of TIMES) {
      theme.draw({ ctx, w: 1920, h: 1080, now, accent: "#4C9E92", state, rgba: makeRgba("#4C9E92") });
    }
    assert.equal(stateOf.globalCompositeOperation, "source-over",
      `${theme.id} left globalCompositeOperation set; the next frame will blend wrong`);
    assert.equal(stateOf.globalAlpha, 1, `${theme.id} left globalAlpha set`);
    assert.equal(saved.length, 0, `${theme.id} has unbalanced save()/restore()`);
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
