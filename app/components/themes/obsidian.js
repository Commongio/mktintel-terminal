// Obsidian — for serious traders. No particles, no stars, no glow.
//
// "A polished slab of volcanic glass. You shouldn't notice the animation for
// five minutes. Then suddenly realize: wait, the light is moving."
//
// ── DEVIATION: THE PALETTE WAS SEPARATED ────────────────────────────────────
//
// The bible specifies #010101 / #050505 / #090909 — steps of 4/255. That is at
// or below the banding threshold of most panels, and this backdrop sits behind
// a UI whose own background is #060910, so the facets would be invisible on
// every display and the theme would look identical to "off".
//
// The steps are widened to roughly 10/255 and given a faint blue cast, which
// is still far darker than any other theme here and preserves the intent — a
// slab you can just make out. "Almost invisible" is the goal; "actually
// invisible" is a bug, and the difference is a few values.
//
// Everything else is as written: 20-30 polygons, fixed geometry, one enormous
// light on a 120s traverse, and nothing else moving.

const BASE = "#040507";
const FACET_LO = "10,12,16";
const FACET_HI = "22,26,33";
const LIGHT_PERIOD = 120_000;   // bible: 120s
const FACETS = 26;              // bible: 20-30

export default {
  id: "obsidian",
  label: "Obsidian",
  desc: "Volcanic glass — one slow light across still facets",

  init({ w, h }) {
    const rnd = (i, s) => {
      const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };

    // Facets as fractional coordinates so a resize reshapes rather than
    // regenerating — the geometry "never changes", including across resizes.
    const facets = new Array(FACETS);
    for (let i = 0; i < FACETS; i++) {
      const cx = rnd(i, 1), cy = rnd(i, 2);
      const n = 3 + Math.floor(rnd(i, 3) * 2);       // triangles and quads
      const spread = 0.18 + rnd(i, 4) * 0.30;        // large, per the bible
      const pts = new Array(n);
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2 + rnd(i * 7 + k, 5) * 1.2;
        const rad = spread * (0.55 + rnd(i * 7 + k, 6) * 0.85);
        pts[k] = [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.8];
      }
      facets[i] = { pts, tone: rnd(i, 8), nx: Math.cos(rnd(i, 9) * Math.PI * 2), ny: Math.sin(rnd(i, 9) * Math.PI * 2) };
    }
    return { facets };
  },

  draw({ ctx, w, h, now, state }) {
    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, w, h);

    // The single light. Only this moves.
    const t = (now % LIGHT_PERIOD) / LIGHT_PERIOD;
    const lx = w * (-0.2 + 1.4 * t);
    const ly = h * (0.35 + 0.2 * Math.sin(t * Math.PI * 2));

    const lo = FACET_LO.split(",").map(Number);
    const hi = FACET_HI.split(",").map(Number);

    for (const f of state.facets) {
      // Facet centre, for distance to the light.
      let cx = 0, cy = 0;
      for (const p of f.pts) { cx += p[0]; cy += p[1]; }
      cx = (cx / f.pts.length) * w;
      cy = (cy / f.pts.length) * h;

      const d = Math.hypot(cx - lx, cy - ly) / Math.max(w, h);
      // Falloff, plus a per-facet normal so neighbouring facets catch the
      // light at slightly different moments -- that offset is what makes it
      // read as faceted rather than as one gradient.
      const lit = Math.max(0, 1 - d * 1.6) * (0.55 + 0.45 * (f.nx * 0.5 + 0.5));
      const k = Math.min(1, f.tone * 0.35 + lit * 0.8);

      ctx.fillStyle = `rgb(${Math.round(lo[0] + (hi[0] - lo[0]) * k)},${Math.round(lo[1] + (hi[1] - lo[1]) * k)},${Math.round(lo[2] + (hi[2] - lo[2]) * k)})`;
      ctx.beginPath();
      ctx.moveTo(f.pts[0][0] * w, f.pts[0][1] * h);
      for (let i = 1; i < f.pts.length; i++) ctx.lineTo(f.pts[i][0] * w, f.pts[i][1] * h);
      ctx.closePath();
      ctx.fill();
    }
  },
};
