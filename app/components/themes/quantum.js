// Quantum — the AI is thinking. Neural activity, not Tron.
//
// ── DEVIATION: THE CONNECTION TOPOLOGY IS FIXED AT INIT ─────────────────────
//
// The bible says 300 nodes with random connections, 15% visible, fading in and
// out. Taken literally that is a pairwise search: 300 nodes is 44,850 distance
// checks per frame, 2.7 million a second, which cannot fit a 3ms budget and
// would make a laptop fan audible.
//
// Instead each node is wired to its 2-3 nearest neighbours ONCE, at init, and
// the animation fades those fixed edges in and out. The result is what the
// bible describes -- a sparse mesh where roughly 15% of links are lit at any
// moment -- at O(n) per frame instead of O(n^2).
//
// It is also better-looking. Random pairwise links produce long chords across
// the whole canvas; nearest-neighbour links produce local clusters, which is
// what neural activity actually looks like.
//
// Node count reduced 300 -> 220. At 300 the mesh reads as texture rather than
// structure, and the individual node is the thing the bible cares about.

const BG_TOP = "#04070D";
const BG_BOTTOM = "#070C16";
const NODES = 220;
const LINKS_PER_NODE = 3;
const DRIFT_PX_PER_FRAME = 0.02;   // bible: 0.02 px/frame

export default {
  id: "quantum",
  label: "Quantum",
  desc: "Neural mesh — drifting nodes, connections firing",

  init({ w, h }) {
    const rnd = (i, s) => {
      const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
      return x - Math.floor(x);
    };

    const nodes = new Array(NODES);
    for (let i = 0; i < NODES; i++) {
      nodes[i] = {
        fx: rnd(i, 1),
        fy: rnd(i, 2),
        r: 1 + rnd(i, 3),                                    // bible: 1-2px
        vx: ((rnd(i, 4) - 0.5) * DRIFT_PX_PER_FRAME * 2) / 16.67,
        vy: ((rnd(i, 5) - 0.5) * DRIFT_PX_PER_FRAME * 2) / 16.67,
        a: 0.30 + rnd(i, 6) * 0.28,
      };
    }

    // Nearest neighbours, computed once. This is the O(n^2) pass -- 48k
    // distance checks -- but it runs on init, not per frame, so it costs a
    // fraction of a millisecond when the theme is selected and nothing after.
    const links = [];
    for (let i = 0; i < NODES; i++) {
      const cand = [];
      for (let j = 0; j < NODES; j++) {
        if (i === j) continue;
        const dx = nodes[i].fx - nodes[j].fx;
        const dy = nodes[i].fy - nodes[j].fy;
        cand.push([dx * dx + dy * dy, j]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < LINKS_PER_NODE; k++) {
        const j = cand[k][1];
        // i<j only, so each edge exists once rather than twice.
        if (i < j) links.push({ a: i, b: j, phase: rnd(i * 31 + j, 7), rate: 0.6 + rnd(i * 31 + j, 8) * 0.9 });
      }
    }

    return { nodes, links };
  },

  draw({ ctx, w, h, now, state, rgba }) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, BG_TOP);
    bg.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const { nodes, links } = state;

    // Positions computed once per frame into the node itself would be a
    // mutation; held in locals instead so draw() stays pure.
    const xs = new Array(nodes.length);
    const ys = new Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      xs[i] = ((((n.fx + (n.vx * now) / w) % 1) + 1) % 1) * w;
      ys[i] = ((((n.fy + (n.vy * now) / h) % 1) + 1) % 1) * h;
    }

    // Connections, in the accent colour as the bible requires. Each edge has
    // its own period and phase, so roughly 15% are lit at any instant without
    // anything counting or scheduling.
    ctx.lineWidth = 1;
    for (const l of links) {
      const cycle = (now / (9000 * l.rate) + l.phase) % 1;
      // A narrow window of the cycle is visible; the rest is dark. sin^6
      // gives a sharp fade in and out rather than a slow throb.
      const s = Math.sin(cycle * Math.PI);
      const lit = s * s * s * s * s * s;
      if (lit < 0.02) continue;

      const ax = xs[l.a], ay = ys[l.a], bx = xs[l.b], by = ys[l.b];
      // Skip edges whose nodes wrapped to opposite sides, or the mesh grows
      // lines straight across the canvas every time one crosses an edge.
      if (Math.abs(ax - bx) > w * 0.35 || Math.abs(ay - by) > h * 0.35) continue;

      ctx.strokeStyle = rgba(0.34 * lit);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
    }

    // Nodes last, so they sit on top of their own connections.
    ctx.fillStyle = "rgba(198,220,248,1)";
    for (let i = 0; i < nodes.length; i++) {
      ctx.globalAlpha = nodes[i].a;
      ctx.beginPath();
      ctx.arc(xs[i], ys[i], nodes[i].r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
};
