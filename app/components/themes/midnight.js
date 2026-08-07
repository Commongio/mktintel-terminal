// Kronos Midnight — signature theme.
//
// "A modern trading floor after everyone has gone home. The lights are dim,
// the monitors are still glowing, and the market is still alive somewhere in
// the background."
//
// Not space. Not wallpaper. Ambient energy.
//
// ── DEVIATIONS FROM THE DESIGN BIBLE, AND WHY ───────────────────────────────
//
// 1. FOG AND BLOOM ARE DRAWN AS RADIAL GRADIENTS, NOT BLURRED SHAPES.
//    The bible asks for 800-1400px fog and a 1000-1800px bloom under a
//    <1ms/frame budget. ctx.filter="blur()" cannot do that: a blur at those
//    radii costs tens of milliseconds per frame, because the browser
//    rasterises the shape and convolves it. A radial gradient produces the
//    same soft falloff for roughly the cost of a fill. The look is preserved;
//    the technique is not the one described.
//
// 2. ALPHAS RAISED. The bible specifies fog 0.10 and bloom 0.05 -- 26/255 and
//    13/255. This codebase has already shipped that mistake once: aurora ran
//    at 0.08 and the bug report was "the themes stopped displaying", because
//    under a slightly tinted panel it rounds to nothing. Gradient CENTRES are
//    raised to 0.20 and 0.11, which is roughly where the bible's intent
//    actually becomes visible. They fade to zero at the edge, so the average
//    across the shape lands near the specified value.
//
// 3. The background gradient IS painted opaque, which the theme spec
//    otherwise forbids. That rule exists to keep panels readable; a near-black
//    to deep-navy ramp cannot hurt legibility, and the bible is explicit that
//    the base must not be pure black. Nothing bright is ever painted opaque.
//
// Everything else -- palette, layer order, counts, sizes, the deliberately
// non-commensurate loop periods -- is implemented as written.

// Loop periods, in seconds. Deliberately co-prime-ish: 53/67/91 share no
// common factor, so the three layers never realign and the composition never
// visibly repeats.
const FOG_A_PERIOD = 53_000;
const FOG_B_PERIOD = 67_000;
const BLOOM_PERIOD = 91_000;

const BG_TOP = "#030507";
const BG_BOTTOM = "#08131D";
const FOG_1 = "16,52,77";    // #10344D
const FOG_2 = "26,93,136";   // #1A5D88
const GLOW = "120,190,255";

const DUST_COUNT = 220;      // bible: 180-260

export default {
  id: "midnight",
  label: "Kronos Midnight",
  desc: "Trading floor after hours — drifting fog and ambient dust",

  init({ w, h }) {
    // Deterministic from index: a resize re-runs init, and Math.random() here
    // would reshuffle the whole field every time the window edge moved.
    const rnd = (i, s) => {
      const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };

    const dust = new Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      dust[i] = {
        // Stored as 0..1 fractions so a resize repositions rather than
        // clipping — particles keep their relative place in the field.
        fx: rnd(i, 1),
        fy: rnd(i, 2),
        r: 0.6 + rnd(i, 3) * 1.2,              // bible: 0.6-1.8px
        a: 0.18 + rnd(i, 4) * 0.10,            // bible: 0.18-0.28
        // px/frame at 60fps, converted to px/ms so speed is frame-rate
        // independent. Bible: 0.02-0.06 px/frame.
        vx: ((rnd(i, 5) - 0.5) * 0.06) / 16.67,
        vy: ((rnd(i, 6) - 0.5) * 0.06) / 16.67,
      };
    }
    return { dust, w, h };
  },

  draw({ ctx, w, h, now, accent, state, rgba }) {
    // ── Layer 1: background ramp ────────────────────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, BG_TOP);
    bg.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // ── Layers 2+3: two enormous fog masses ─────────────────────────────────
    // Constrained to the middle 60% of the canvas so they never leave the
    // screen, as the bible requires. Sine on both axes with different periods
    // gives a wandering path rather than an orbit.
    const fog = (period, phase, colour, radius, alpha) => {
      const t = (now % period) / period;
      const cx = w * (0.20 + 0.60 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 + phase)));
      const cy = h * (0.20 + 0.60 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 0.61 + phase * 1.7)));
      // Radius scales with viewport so the look survives a 4K monitor and a
      // laptop; clamped to the bible's 800-1400 band at typical sizes.
      const r = Math.max(800, Math.min(1400, Math.max(w, h) * radius));
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${colour},${alpha})`);
      g.addColorStop(0.55, `rgba(${colour},${alpha * 0.45})`);
      g.addColorStop(1, `rgba(${colour},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };

    fog(FOG_A_PERIOD, 0, FOG_1, 0.95, 0.20);
    fog(FOG_B_PERIOD, 2.4, FOG_2, 0.80, 0.16);

    // The user's accent, folded in at the low end of the bible's 10-15% so it
    // tints the fog rather than competing with it.
    const at = (now % (FOG_B_PERIOD * 1.3)) / (FOG_B_PERIOD * 1.3);
    const ax = w * (0.5 + 0.32 * Math.sin(at * Math.PI * 2));
    const ay = h * (0.5 + 0.26 * Math.cos(at * Math.PI * 2 * 0.77));
    const ar = Math.max(w, h) * 0.7;
    const ag = ctx.createRadialGradient(ax, ay, 0, ax, ay, ar);
    ag.addColorStop(0, rgba(0.13));
    ag.addColorStop(1, rgba(0));
    ctx.fillStyle = ag;
    ctx.fillRect(0, 0, w, h);

    // ── Layer 4: floating dust ──────────────────────────────────────────────
    // Position is a pure function of `now`, never accumulated, so the field is
    // identical on a 60Hz and a 144Hz display and survives a tab-hidden pause
    // without drifting.
    const dust = state.dust;
    ctx.fillStyle = `rgba(214,232,255,1)`;
    for (let i = 0; i < dust.length; i++) {
      const p = dust[i];
      // Wrap with a modulo on the fractional position: a particle leaving one
      // edge reappears on the other, so the field never depletes.
      const x = (((p.fx + (p.vx * now) / w) % 1) + 1) % 1 * w;
      const y = (((p.fy + (p.vy * now) / h) % 1) + 1) % 1 * h;
      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── Layer 5: ambient bloom ──────────────────────────────────────────────
    // Centre kept off-screen, per the bible, so it reads as light spilling in
    // from somewhere rather than a lamp sitting in the picture.
    const bt = (now % BLOOM_PERIOD) / BLOOM_PERIOD;
    const bx = w * (-0.25 + 1.5 * (0.5 + 0.5 * Math.sin(bt * Math.PI * 2)));
    const by = h * -0.15;
    const br = Math.max(1000, Math.min(1800, Math.max(w, h) * 1.15));
    const bg2 = ctx.createRadialGradient(bx, by, 0, bx, by, br);
    bg2.addColorStop(0, `rgba(${GLOW},0.11)`);
    bg2.addColorStop(0.5, `rgba(${GLOW},0.04)`);
    bg2.addColorStop(1, `rgba(${GLOW},0)`);
    ctx.fillStyle = bg2;
    ctx.fillRect(0, 0, w, h);
  },
};
