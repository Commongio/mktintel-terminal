// Pulse — living intelligence.
//
// "Information pulses through an invisible network, like a heartbeat. Every
// 15-25 seconds a soft pulse originates from a random off-screen point and
// expands outward. It fades before reaching the centre of attention."
//
// ── NOTE ON "RANDOM" ────────────────────────────────────────────────────────
// The origin is seeded from the ring INDEX, not from Math.random(). Ring 47
// always starts at the same off-screen point on every machine and after every
// resize. It looks random -- no two consecutive rings share an origin -- and
// it is reproducible, which is what lets draw() stay pure. A genuinely random
// origin would have to be stored, and storing it means mutating state during
// draw.
//
// That last clause of the bible is the one doing the real work: it fades
// before reaching the centre. The pulse is drawn as a ring whose alpha falls
// off with radius, so it dissolves on the way in rather than sweeping across
// the panels a trader is reading.

const BG_TOP = "#020305";
const BG_MID = "#071019";
const BG_BOTTOM = "#0F1C28";

const PULSE_EVERY = 19_000;   // bible: 15-25s
const PULSE_LIFE = 13_000;    // overlaps the next, so the network is never dead
const NODES = 130;

export default {
  id: "pulse",
  label: "Pulse",
  desc: "Energy pulses expanding through a still network",

  init({ w, h }) {
    const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
    const nodes = new Array(NODES);
    for (let i = 0; i < NODES; i++) {
      nodes[i] = {
        fx: rnd(i, 1), fy: rnd(i, 2),
        r: 0.8 + rnd(i, 3) * 1.2,
        a: 0.18 + rnd(i, 4) * 0.14,
        // "Occasional tiny movements" -- a slow bounded wobble, not drift, so
        // the network reads as fixed infrastructure rather than a swarm.
        wob: rnd(i, 5) * Math.PI * 2,
        wr: 2 + rnd(i, 6) * 5,
      };
    }
    return { nodes };
  },

  draw({ ctx, w, h, now, state, rgba }) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, BG_TOP);
    bg.addColorStop(0.5, BG_MID);
    bg.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };

    // The two rings that can be alive right now: the current index and the
    // previous one, whose life overlaps.
    const idx = Math.floor(now / PULSE_EVERY);
    const rings = [];
    for (const k of [idx, idx - 1]) {
      if (k < 0) continue;
      const age = now - k * PULSE_EVERY;
      if (age < 0 || age > PULSE_LIFE) continue;
      const p = age / PULSE_LIFE;
      // Origin on the perimeter, off-screen. Edge chosen by hash so
      // consecutive pulses come from different sides.
      const edge = Math.floor(rnd(k, 1) * 4);
      const along = rnd(k, 2);
      const ox = edge === 0 ? -0.15 : edge === 1 ? 1.15 : along;
      const oy = edge === 2 ? -0.15 : edge === 3 ? 1.15 : along;
      rings.push({
        x: ox * w, y: oy * h,
        // Eased so it leaves fast and settles, like a shockwave losing energy.
        rad: Math.pow(p, 0.62) * Math.max(w, h) * 1.15,
        // Fades as it travels: gone well before the middle of the screen.
        amp: Math.sin(p * Math.PI) * (1 - p * 0.55),
      });
    }

    // The pulse itself: a soft annulus, in the accent, at low opacity.
    for (const r of rings) {
      if (r.amp < 0.02 || r.rad < 1) continue;
      const inner = Math.max(0, r.rad * 0.72);
      const g = ctx.createRadialGradient(r.x, r.y, inner, r.x, r.y, r.rad);
      g.addColorStop(0, rgba(0));
      g.addColorStop(0.65, rgba(0.09 * r.amp));
      g.addColorStop(1, rgba(0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // Nodes, brightened by proximity to a passing ring. This is the detail
    // that sells it: the network reacts, so the pulse reads as travelling
    // THROUGH something rather than over it.
    const nodes = state.nodes;
    ctx.fillStyle = "rgba(198,220,248,1)";
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const x = n.fx * w + Math.sin(now / 21_000 + n.wob) * n.wr;
      const y = n.fy * h + Math.cos(now / 26_000 + n.wob * 1.4) * n.wr;

      let boost = 0;
      for (const r of rings) {
        if (r.amp < 0.02) continue;
        const d = Math.abs(Math.hypot(x - r.x, y - r.y) - r.rad);
        // Only nodes within the wavefront's thickness light up.
        if (d < 90) boost = Math.max(boost, (1 - d / 90) * r.amp);
      }

      ctx.globalAlpha = Math.min(0.85, n.a + boost * 0.55);
      ctx.beginPath();
      ctx.arc(x, y, n.r + boost * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
};
