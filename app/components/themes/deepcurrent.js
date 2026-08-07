// Deep Current — calm continuous flow.
//
// "Not water. Slow-moving energy. Hundreds of tiny dots moving as if carried
// by underwater currents. No waves, no ripples."
//
// ── DEVIATION: THE FIELD IS CLOSED-FORM, NOT INTEGRATED ─────────────────────
//
// A real flow field advects particles: each frame you sample a velocity field
// and add it to the particle's position. That requires MUTATING particle state
// every frame, and draw() is asserted pure by the test suite -- it runs once
// directly for the guaranteed first paint and again from rAF, so an integrated
// field would advance twice on frame one and drift differently on a 144Hz
// display.
//
// So the displacement is expressed in closed form: each particle's offset is a
// function of its rest position and `now`, sampled from a stream function.
// Because the displacement derives from a stream function it is
// divergence-free -- particles neither bunch up nor thin out, which is exactly
// what makes real current fields look like currents.
//
// The visible result is what the bible asks for. The mechanism is different,
// and it is also the only mechanism that survives a resize without the field
// restarting.

const BG_TOP = "#021018";
const BG_MID = "#062030";
const BG_BOTTOM = "#0B3044";

const PARTICLES = 260;
const FLOW_PERIOD = 74_000;

export default {
  id: "deepcurrent",
  label: "Deep Current",
  desc: "Particles carried by invisible currents",

  init({ w, h }) {
    const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
    const parts = new Array(PARTICLES);
    for (let i = 0; i < PARTICLES; i++) {
      parts[i] = {
        fx: rnd(i, 1),
        fy: rnd(i, 2),
        r: 0.5 + rnd(i, 3) * 1.1,
        a: 0.16 + rnd(i, 4) * 0.16,
        // Per-particle phase, so neighbours on the same streamline are not
        // synchronised -- otherwise the field pulses instead of flowing.
        ph: rnd(i, 5) * Math.PI * 2,
        // Depth: slower, fainter particles read as further away.
        d: 0.45 + rnd(i, 6) * 0.55,
      };
    }
    return { parts };
  },

  draw({ ctx, w, h, now, state, accent, rgba }) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, BG_TOP);
    bg.addColorStop(0.5, BG_MID);
    bg.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Accent tint over the flow field: two broad, slow lobes so the colour
    // moves with the current rather than sitting on top of it.
    const ft = (now % FLOW_PERIOD) / FLOW_PERIOD;
    const gx = w * (0.5 + 0.30 * Math.sin(ft * Math.PI * 2));
    const gy = h * (0.5 + 0.22 * Math.cos(ft * Math.PI * 2 * 0.83));
    const gr = Math.max(w, h) * 0.85;
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    g.addColorStop(0, rgba(0.10));
    g.addColorStop(1, rgba(0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // The current. Displacement is the curl of a stream function built from two
    // sine terms -- cheap, smooth, and divergence-free.
    const t = now / 1000;
    const parts = state.parts;
    ctx.fillStyle = "rgba(180,214,238,1)";

    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      // Rest position, drifting slowly along x so the whole field migrates.
      const bx = (((p.fx + (t * 0.004 * p.d) % 1) + 1) % 1);
      const by = p.fy;

      // Curl of psi = sin(a)*cos(b): (dpsi/dy, -dpsi/dx).
      const a1 = bx * 6.1 + t * 0.06 + p.ph;
      const b1 = by * 4.3 - t * 0.045;
      const dx = Math.cos(a1) * Math.sin(b1) * 0.055 * p.d;
      const dy = Math.sin(a1) * Math.cos(b1) * 0.075 * p.d;

      const x = (((bx + dx) % 1) + 1) % 1 * w;
      const y = Math.max(0, Math.min(1, by + dy)) * h;

      ctx.globalAlpha = p.a * p.d;
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Soft bloom, top-left, well off centre so it never sits behind the panels.
    const br = Math.max(w, h) * 0.9;
    const bl = ctx.createRadialGradient(w * 0.12, h * 0.1, 0, w * 0.12, h * 0.1, br);
    bl.addColorStop(0, "rgba(120,190,255,0.07)");
    bl.addColorStop(1, "rgba(120,190,255,0)");
    ctx.fillStyle = bl;
    ctx.fillRect(0, 0, w, h);
  },
};
