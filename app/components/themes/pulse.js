// Pulse — living intelligence.
//
// ── WHY THE FIRST VERSION FAILED ────────────────────────────────────────────
// One ring every 19 seconds, lasting 13, at 0.09 alpha. So the theme was
// literally blank for six seconds out of every nineteen, and barely present
// for the rest. "Subtle" was implemented as "absent", and a heartbeat you
// cannot see is not a heartbeat.
//
// What makes this read as a living network:
//
//   1. THE NETWORK IS ALWAYS THERE. Nodes and the links between them are drawn
//      continuously at a low but real level. The pulse then travels through
//      something. Previously it travelled through nothing, so there was no
//      network to animate -- just rings on a black field.
//   2. LINKS CARRY THE PULSE. A link lights when the wavefront crosses its
//      MIDPOINT, so energy visibly propagates along the mesh rather than every
//      node blinking at once. This is the detail that sells it as conduction.
//   3. THREE OVERLAPPING RINGS on staggered offsets, so the network is never
//      idle and pulses sometimes cross -- and where two wavefronts overlap,
//      nodes light brighter. Interference is free and it looks deliberate.

const BG_TOP = "#020305";
const BG_MID = "#08131E";
const BG_BOTTOM = "#0F1E2B";

const PULSE_EVERY = 7_200;    // three in flight against a 21s life
const PULSE_LIFE = 21_000;
const NODES = 150;
const LINKS_PER_NODE = 2;

export default {
  id: "pulse",
  label: "Pulse",
  desc: "Energy conducting through a living network",

  init({ w, h }) {
    const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };

    const nodes = new Array(NODES);
    for (let i = 0; i < NODES; i++) {
      nodes[i] = {
        fx: rnd(i, 1), fy: rnd(i, 2),
        r: 0.9 + rnd(i, 3) * 1.3,
        a: 0.20 + rnd(i, 4) * 0.16,
        wob: rnd(i, 5) * Math.PI * 2,
        wr: 2 + rnd(i, 6) * 5,
      };
    }

    // Nearest neighbours, once. The O(n^2) pass runs on init, never per frame.
    const links = [];
    for (let i = 0; i < NODES; i++) {
      const cand = [];
      for (let j = 0; j < NODES; j++) {
        if (i === j) continue;
        const dx = nodes[i].fx - nodes[j].fx, dy = nodes[i].fy - nodes[j].fy;
        cand.push([dx * dx + dy * dy, j]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < LINKS_PER_NODE; k++) {
        const j = cand[k][1];
        if (i < j) links.push({ a: i, b: j });
      }
    }
    return { nodes, links };
  },

  draw({ ctx, w, h, now, state, rgba }) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, BG_TOP);
    bg.addColorStop(0.5, BG_MID);
    bg.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };

    // Every ring currently in flight. Origins are seeded from the ring INDEX,
    // so ring 47 starts at the same off-screen point on every machine and
    // after every resize -- looks random, stays reproducible, keeps draw()
    // pure.
    const rings = [];
    const newest = Math.floor(now / PULSE_EVERY);
    for (let k = newest; k > newest - Math.ceil(PULSE_LIFE / PULSE_EVERY) - 1; k--) {
      if (k < 0) continue;
      const age = now - k * PULSE_EVERY;
      if (age < 0 || age > PULSE_LIFE) continue;
      const p = age / PULSE_LIFE;
      const edge = Math.floor(rnd(k, 1) * 4);
      const along = rnd(k, 2);
      const ox = edge === 0 ? -0.12 : edge === 1 ? 1.12 : along;
      const oy = edge === 2 ? -0.12 : edge === 3 ? 1.12 : along;
      rings.push({
        x: ox * w, y: oy * h,
        rad: Math.pow(p, 0.58) * Math.max(w, h) * 1.25,
        amp: Math.sin(p * Math.PI) * (1 - p * 0.35),
      });
    }

    const { nodes, links } = state;

    const xs = new Array(nodes.length), ys = new Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      xs[i] = n.fx * w + Math.sin(now / 19_000 + n.wob) * n.wr;
      ys[i] = n.fy * h + Math.cos(now / 24_000 + n.wob * 1.4) * n.wr;
    }

    // How strongly a point sits inside a wavefront. Overlapping rings ADD, so
    // crossing pulses interfere constructively -- free, and it reads as
    // deliberate design.
    const energyAt = (x, y) => {
      let e = 0;
      for (const r of rings) {
        if (r.amp < 0.02) continue;
        const d = Math.abs(Math.hypot(x - r.x, y - r.y) - r.rad);
        if (d < 130) e += (1 - d / 130) * r.amp;
      }
      return e;
    };

    // ── links, always present ───────────────────────────────────────────────
    // Sampled at the MIDPOINT so a link lights as the wavefront reaches it,
    // and the eye sees energy travelling along the mesh.
    ctx.lineWidth = 1;
    for (const l of links) {
      const ax = xs[l.a], ay = ys[l.a], bx = xs[l.b], by = ys[l.b];
      const e = energyAt((ax + bx) / 2, (ay + by) / 2);
      ctx.strokeStyle = rgba(0.055 + Math.min(0.42, e * 0.46));
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // ── the wavefronts themselves ───────────────────────────────────────────
    for (const r of rings) {
      if (r.amp < 0.03 || r.rad < 1) continue;
      const g = ctx.createRadialGradient(r.x, r.y, Math.max(0, r.rad * 0.80), r.x, r.y, r.rad * 1.10);
      g.addColorStop(0, rgba(0));
      g.addColorStop(0.55, rgba(0.10 * r.amp));
      g.addColorStop(1, rgba(0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    // ── nodes ───────────────────────────────────────────────────────────────
    for (let i = 0; i < nodes.length; i++) {
      const e = Math.min(1, energyAt(xs[i], ys[i]));
      const n = nodes[i];

      // A halo only on nodes that are actually firing, so the mesh has peaks
      // rather than a uniform glow.
      if (e > 0.18) {
        const hg = ctx.createRadialGradient(xs[i], ys[i], 0, xs[i], ys[i], 16 + e * 20);
        hg.addColorStop(0, rgba(0.30 * e));
        hg.addColorStop(1, rgba(0));
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(xs[i], ys[i], 16 + e * 20, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = `rgba(206,228,252,${Math.min(0.92, n.a + e * 0.62)})`;
      ctx.beginPath();
      ctx.arc(xs[i], ys[i], n.r + e * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Vignette, so the pulses fade toward the middle exactly as the bible asks
    // -- they dissolve before reaching what someone is reading.
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.18, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    vig.addColorStop(0, "rgba(2,3,5,0.55)");
    vig.addColorStop(0.55, "rgba(2,3,5,0.16)");
    vig.addColorStop(1, "rgba(2,3,5,0)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  },
};
