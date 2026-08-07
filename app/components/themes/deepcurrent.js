// Deep Current — calm continuous flow.
//
// ── WHY THE FIRST VERSION FAILED ────────────────────────────────────────────
// The displacement was bounded by a sine, so every particle orbited a fixed
// home position by a few pixels. Mathematically a flow field; visually a field
// of dots vibrating in place. Nothing travelled, so nothing flowed.
//
// Two changes fix it, and the second is the one that matters:
//
//   1. Particles TRAVEL. Each rides a long looping path that crosses the whole
//      canvas and wraps at the edges, so displacement is a large fraction of
//      the screen rather than a wobble.
//   2. They leave TRAILS. A moving dot has no direction — at these speeds the
//      eye cannot tell a drifting speck from a stationary one. A short tapered
//      streak behind each particle makes the current legible instantly, and it
//      is the single reason flow-field art reads as flow at all.
//
// Trails are drawn by sampling the same closed-form path at (now - k*dt), so
// draw() stays pure: no history is stored, the tail is simply where the
// particle WAS, recomputed.

const BG_TOP = "#02121B";
const BG_MID = "#062434";
const BG_BOTTOM = "#0B3448";

const PARTICLES = 240;
const TAIL = 4;            // samples behind the head
const TAIL_DT = 230;       // ms between samples
const BANDS = 3;           // depth bands, for batching

export default {
  id: "deepcurrent",
  label: "Deep Current",
  desc: "Slow currents carrying light through deep water",

  init({ w, h }) {
    const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
    const parts = new Array(PARTICLES);
    for (let i = 0; i < PARTICLES; i++) {
      parts[i] = {
        // Lane, not position: particles are seeded across the height and
        // travel horizontally, which is what makes a current read as a current
        // rather than as Brownian motion.
        lane: rnd(i, 1),
        off: rnd(i, 2),
        r: 0.5 + rnd(i, 3) * 1.15,
        // Depth drives speed, size and brightness together. Three cues
        // agreeing is what produces parallax instead of noise.
        d: 0.35 + rnd(i, 5) * 0.65,
        ph: rnd(i, 6) * Math.PI * 2,
      };
    }
    return { parts };
  },

  draw({ ctx, w, h, now, state, rgba }) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, BG_TOP);
    bg.addColorStop(0.55, BG_MID);
    bg.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Two broad slow lobes of accent, drifting against each other so the water
    // has volume rather than one flat tint.
    for (const [per, ax, ay, rad, al] of [
      [83_000, 0.32, 0.34, 0.80, 0.11],
      [61_000, 0.70, 0.66, 0.65, 0.08],
    ]) {
      const t = (now % per) / per;
      const gx = w * (ax + 0.16 * Math.sin(t * Math.PI * 2));
      const gy = h * (ay + 0.13 * Math.cos(t * Math.PI * 2 * 0.8));
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(w, h) * rad);
      g.addColorStop(0, rgba(al));
      g.addColorStop(1, rgba(0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Position at an arbitrary time. Pure, so a tail sample is just this
    // evaluated in the past — no stored history, identical on every refresh
    // rate, and unaffected by a tab-hidden pause.
    const at = (p, ms) => {
      const t = ms / 1000;
      // A full traverse every ~90-260s depending on depth.
      const x = (p.off + t * (0.0038 + p.d * 0.0075)) % 1;
      // The current. Two out-of-phase sines give a serpentine path; the x term
      // makes the meander travel WITH the particle rather than the whole lane
      // oscillating together.
      const y = p.lane
        + Math.sin(x * 4.1 + p.ph + t * 0.055) * 0.085
        + Math.sin(x * 9.3 - t * 0.031) * 0.032;
      return [((x % 1) + 1) % 1 * w, (((y % 1) + 1) % 1) * h];
    };

    const parts = state.parts;
    ctx.lineCap = "round";

    // ── tails, batched by depth band ────────────────────────────────────────
    // One stroke per (segment, band) rather than one per particle per segment.
    // The naive version issued 240 x 5 = 1200 strokes a frame and blew the
    // budget outright; this issues 12, because every segment sharing an alpha
    // and a width can live in a single path.
    for (let k = 1; k <= TAIL; k++) {
      const f = 1 - k / (TAIL + 1);
      for (let b = 0; b < BANDS; b++) {
        const lo = b / BANDS, hi = (b + 1) / BANDS;
        const dMid = 0.35 + ((lo + hi) / 2) * 0.65;
        ctx.strokeStyle = "rgba(168,214,240," + (0.34 * dMid * f * 0.62).toFixed(4) + ")";
        ctx.lineWidth = Math.max(0.4, 1.6 * dMid * f);
        ctx.beginPath();
        let drew = false;
        for (let i = 0; i < parts.length; i++) {
          const pt = parts[i];
          const dn = (pt.d - 0.35) / 0.65;
          if (dn < lo || dn >= hi) continue;
          const a = at(pt, now - (k - 1) * TAIL_DT);
          const c = at(pt, now - k * TAIL_DT);
          // A segment that wrapped would draw straight across the canvas.
          if (Math.abs(c[0] - a[0]) > w * 0.5) continue;
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(c[0], c[1]);
          drew = true;
        }
        if (drew) ctx.stroke();
      }
    }

    // Heads, also banded: many arcs in one path, one fill per band.
    for (let b = 0; b < BANDS; b++) {
      const lo = b / BANDS, hi = (b + 1) / BANDS;
      const dMid = 0.35 + ((lo + hi) / 2) * 0.65;
      ctx.fillStyle = "rgba(198,232,252," + (0.34 * dMid).toFixed(4) + ")";
      ctx.beginPath();
      for (let i = 0; i < parts.length; i++) {
        const pt = parts[i];
        const dn = (pt.d - 0.35) / 0.65;
        if (dn < lo || dn >= hi) continue;
        const p0 = at(pt, now);
        const r = pt.r * (0.6 + dMid * 0.6);
        ctx.moveTo(p0[0] + r, p0[1]);
        ctx.arc(p0[0], p0[1], r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Light from above, as in real water — and it darkens the floor, so the
    // lower panels do not sit on a lighter field than the upper ones.
    const col = ctx.createLinearGradient(0, 0, 0, h);
    col.addColorStop(0, "rgba(150,205,240,0.08)");
    col.addColorStop(0.45, "rgba(150,205,240,0.015)");
    col.addColorStop(1, "rgba(0,0,0,0.30)");
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, w, h);
  },
};
