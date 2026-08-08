// Ambient — additive bokeh drifting through a soft central light.
//
// Ported from a CreateJS + GSAP ParticleEngine. The DESIGN is carried over
// faithfully; none of the code could be, and the reasons are worth stating
// because they are the same three rules every theme here lives under.
//
//   NO LIBRARIES. The original is EaselJS shapes driven by TweenMax. The
//   registry is dependency-free 2D canvas, so display objects, BlurFilter and
//   tweens all had to become drawing math.
//
//   NO Math.random(). The original seeds every particle randomly. init() re-runs
//   on resize, so a random field reshuffles itself each time the user drags a
//   window edge -- which reads as the theme restarting. Every draw of a random
//   number is replaced by a deterministic hash of the particle index, so the
//   field RESHAPES on resize instead.
//
//   draw() MUST BE PURE. The original animates by recursive tween callbacks:
//   animateBall picks a random target, tweens to it, and on completion calls
//   itself with a fresh target, mutating the particle each time. Called twice
//   for one frame it advances twice, and the guaranteed first paint does
//   exactly that. Every tween is therefore re-expressed as a closed-form
//   function of `now`: position, alpha and scale are evaluated, never
//   accumulated.
//
// ── WHAT THE ORIGINAL'S LOOK ACTUALLY COMES FROM ────────────────────────────
//
//   1. ADDITIVE BLENDING. compositeOperation "lighter" is the whole aesthetic.
//      Where two translucent particles overlap they SUM toward white instead of
//      averaging to mud, so density itself becomes brightness. Drop it and the
//      same particles look like grey dust.
//
//   2. A WEIGHTED BAND, not a uniform field. weightedRange puts 80% of
//      particles in the middle of the height and 60% in the middle half of the
//      width. That is what makes it a luminous cloud with an edge rather than
//      an evenly-speckled rectangle, and it is easy to miss when reading the
//      settings.
//
//   3. THREE SIZE CLASSES WITH INVERSE COUNTS. 300 small at alpha 0.40, 100
//      medium at 0.30, 10 large at 0.20. Many small bright points, a few big
//      dim ones. That inversion is what produces depth; equal counts read flat.
//
//   4. SMALL PARTICLES ARE STROKED RINGS, not discs. Only the medium and large
//      are filled and blurred. Hollow rings at the smallest size give the field
//      its fine texture -- and they batch, which is why the port can afford
//      them.
//
// Counts are scaled down from 410 to 238. The original gets away with 410
// because CreateJS caches every blurred particle to its own bitmap once; this
// draws each frame directly, and 410 blurred fills would blow the frame budget
// several times over.
//
// Colour is the user's accent rather than the original's fixed cyan, so the
// backdrop matches whatever the terminal is set to. At the default teal the
// two are close family anyway.

const BG_TOP = "#01080D";
const BG_BOTTOM = "#03141C";

// Deliberately non-commensurate, as elsewhere in this family: the three lights
// never realign, so the composition does not visibly loop.
const LIGHTS = [
  { rx: 400, ry: 100, alpha: 0.30, ox: 0.00, oy: 0.00, period: 20_000, sx: 1.5, sy: 1.0, tx: 2.0, ty: 0.7 },
  { rx: 350, ry: 250, alpha: 0.17, ox: -0.05, oy: 0.00, period: 24_000, sx: 1.0, sy: 1.0, tx: 2.0, ty: 2.0, dx: 0.10, dy: -0.05 },
  { rx: 100, ry: 80, alpha: 0.12, ox: 0.08, oy: -0.05, period: 16_000, sx: 1.0, sy: 1.0, tx: 1.5, ty: 1.5, dx: -0.20, dy: 0.00 },
];

// [count, radius, alphaMax, bandHeight, filled]
const CLASSES = [
  { id: "small", num: 160, r: 3, alphaMax: 0.40, band: 0.5, fill: false },
  { id: "medium", num: 70, r: 8, alphaMax: 0.30, band: 1.0, fill: true },
  { id: "large", num: 8, r: 30, alphaMax: 0.20, band: 1.0, fill: true },
];

const hash = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };

/**
 * The original's weightedRange, with the coin flip and both draws taken from a
 * hash of the index instead of Math.random().
 *
 * This is the function that shapes the composition: with strength 0.8 it puts
 * four particles in five inside the band and lets the fifth go anywhere, which
 * is a soft-edged cloud rather than either a hard cluster or an even spread.
 */
function weighted(i, salt, lo, hi, bandLo, bandHi, strength) {
  return hash(i, salt) <= strength
    ? bandLo + hash(i, salt + 31) * (bandHi - bandLo)
    : lo + hash(i, salt + 31) * (hi - lo);
}

export default {
  id: "ambient",
  label: "Ambient",
  desc: "Additive bokeh drifting through a soft light",

  init({ w, h }) {
    const parts = [];
    let n = 0;
    for (let c = 0; c < CLASSES.length; c++) {
      const cls = CLASSES[c];
      for (let k = 0; k < cls.num; k++, n++) {
        // Vertical band: areaHeight 0.5 gives the small class a tight belt,
        // 1.0 gives the larger classes a looser one. Straight from the
        // original's (2 -/+ areaHeight/2)/4 expression.
        const bandLo = (2 - cls.band / 2) / 4, bandHi = (2 + cls.band / 2) / 4;
        parts.push({
          c,
          // Fractions of the canvas, so a resize repositions rather than clips.
          fx: weighted(n, 1, 0, 1, 0.25, 0.75, 0.6),
          fy: weighted(n, 3, 0, 1, bandLo, bandHi, 0.8),
          // The original wanders within ballwidth*2 of home.
          dist: cls.r * 2,
          // Tween duration was range(2,10) seconds, re-rolled every cycle.
          // A fixed per-particle period is the closed-form equivalent.
          period: 4_000 + hash(n, 5) * 16_000,
          ph: hash(n, 6) * Math.PI * 2,
          ph2: hash(n, 7) * Math.PI * 2,
          // Two incommensurate wander frequencies. One sine alone is a visible
          // back-and-forth; two multiplied is a drift that does not repeat on
          // any timescale the eye can hold.
          w1: 0.00013 + hash(n, 8) * 0.00021,
          w2: 0.00009 + hash(n, 9) * 0.00017,
          scaleBase: 0.3 + hash(n, 10) * 0.7,
        });
      }
    }
    return { parts };
  },

  draw({ ctx, w, h, now, state, rgba }) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, BG_TOP);
    bg.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // ── additive from here on ───────────────────────────────────────────────
    // "lighter" is the original's compositeStyle and the reason the look works
    // at all: overlapping particles SUM toward white rather than averaging to
    // grey, so density reads as brightness.
    //
    // It MUST be reset before returning. The canvas context outlives the frame
    // -- the host only calls clearRect -- so leaving it set means the next
    // frame's opaque background fill is drawn additively over the last one,
    // and the screen ramps to white in about a second.
    ctx.globalCompositeOperation = "lighter";

    const S = Math.min(w, h) / 700;   // the original's sizes assume ~700px

    // ── three breathing lights ──────────────────────────────────────────────
    // TweenMax yoyo with easeInOut is a sine, exactly, so each 10-24s tween
    // becomes one cosine term. Elliptical gradients come from scaling the
    // context around the centre, since createRadialGradient is circular only.
    for (const L of LIGHTS) {
      const t = (Math.cos((now / L.period) * Math.PI * 2) + 1) / 2;   // 1 -> 0 -> 1
      const sx = (L.sx + (L.tx - L.sx) * (1 - t)) * S;
      const sy = (L.sy + (L.ty - L.sy) * (1 - t)) * S;
      const cx = w * (0.5 + L.ox + (L.dx ?? 0) * (1 - t));
      const cy = h * (0.5 + L.oy + (L.dy ?? 0) * (1 - t));

      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(sx, sy);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, L.rx / 2);
      // The original applies a BlurFilter the full width of the ellipse, which
      // is a gradient with no hard stop. Three stops match its falloff closely
      // enough that the difference is invisible at this alpha.
      g.addColorStop(0, rgba(L.alpha));
      g.addColorStop(0.45, rgba(L.alpha * 0.42));
      g.addColorStop(1, rgba(0));
      ctx.fillStyle = g;
      // In the scaled frame, x is squashed by rx/ry relative to y.
      const ar = L.rx / L.ry;
      ctx.fillRect(-L.rx, (-L.rx / ar), L.rx * 2, (L.rx * 2) / ar);
      ctx.restore();
    }

    const parts = state.parts;

    // Position, alpha and scale for one particle at one instant. Every tween
    // in the original collapses into this: nothing is stored between frames.
    const at = (p) => {
      const cls = CLASSES[p.c];
      const d = p.dist * S;
      // Product of two sines: bounded by dist, smooth, and without the visible
      // period a single sine would have.
      const x = p.fx * w + d * Math.sin(now * p.w1 + p.ph) * Math.cos(now * p.w2 + p.ph2);
      const y = p.fy * h + d * Math.cos(now * p.w2 + p.ph) * Math.sin(now * p.w1 + p.ph2);
      // The original fades in over speed/2 to alphaMax, then out to zero, then
      // repeats. sin over half a period is that curve, and it is continuous at
      // both ends -- so particles never pop in or out.
      const cycle = ((now / p.period) + p.ph / (Math.PI * 2)) % 1;
      const a = cls.alphaMax * Math.sin(cycle * Math.PI);
      const s = p.scaleBase * (0.75 + 0.25 * Math.sin(now * p.w2 * 1.7 + p.ph2));
      return [x, y, a, s];
    };

    // ── small: stroked rings, batched by alpha ──────────────────────────────
    // Hollow rings are what give the field its fine texture. Four alpha bands
    // means four strokes for 160 particles instead of 160.
    const RING_BANDS = 4;
    const rings = Array.from({ length: RING_BANDS }, () => []);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (CLASSES[p.c].fill) continue;
      const [x, y, a, s] = at(p);
      if (a < 0.012) continue;
      const b = Math.min(RING_BANDS - 1, Math.floor((a / CLASSES[p.c].alphaMax) * RING_BANDS));
      rings[b].push([x, y, CLASSES[p.c].r * s * S]);
    }
    ctx.lineWidth = 1;
    for (let b = 0; b < RING_BANDS; b++) {
      if (!rings[b].length) continue;
      ctx.strokeStyle = rgba((CLASSES[0].alphaMax * (b + 0.5)) / RING_BANDS);
      ctx.beginPath();
      for (const [x, y, r] of rings[b]) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
      ctx.stroke();
    }

    // ── medium and large: soft filled blobs ─────────────────────────────────
    // The original blurs each filled particle and caches it to a bitmap. There
    // is no cache here, so a per-particle gradient would mean 78 gradient
    // objects a frame. Instead ONE gradient per class is built at the origin
    // and the context is translated onto each particle -- gradients live in
    // user space, so they move with the transform. Two gradients a frame.
    for (let c = 1; c < CLASSES.length; c++) {
      const cls = CLASSES[c];
      const R = cls.r * S;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, rgba(1));
      g.addColorStop(0.4, rgba(0.45));
      g.addColorStop(1, rgba(0));
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p.c !== c) continue;
        const [x, y, a, s] = at(p);
        if (a < 0.008) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(s, s);
        ctx.globalAlpha = a;
        ctx.fillStyle = g;
        ctx.fillRect(-R, -R, R * 2, R * 2);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    // Back to normal blending BEFORE anything else is drawn, and before the
    // next frame's background fill. See the note above -- this single line is
    // the difference between the theme working and the screen going white.
    ctx.globalCompositeOperation = "source-over";

    // Vignette, drawn in normal mode so it can actually darken. Under
    // "lighter" a dark fill is a no-op, which is the trap in vignetting an
    // additive scene.
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.34, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
    vig.addColorStop(0, "rgba(1,8,13,0)");
    vig.addColorStop(1, "rgba(1,8,13,0.58)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  },
};
