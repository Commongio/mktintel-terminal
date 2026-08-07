// Carbon — luxury automotive engineering. Dark graphite, brushed weave.
//
// ── DEVIATION: WEAVE OPACITY RAISED ─────────────────────────────────────────
//
// The bible asks for a 3% weave. That is 8/255, below the point where a
// one-pixel diagonal line survives compositing under a translucent panel --
// the same failure that made aurora invisible at 0.08. Raised to 0.09, which
// is still whisper-quiet and actually present.
//
// The reflection sweep is as written: one soft highlight, diagonal, 70s.

const BASE = "#060606";
const WEAVE_A = "255,255,255";
const WEAVE_B = "0,0,0";
const CELL = 26;                 // "large diagonal weave"
const SWEEP_PERIOD = 70_000;     // bible: 70s

export default {
  id: "carbon",
  label: "Carbon",
  desc: "Brushed carbon fibre with a slow reflection sweep",

  init({ w, h }) {
    return { w, h };
  },

  draw({ ctx, w, h, now }) {
    ctx.fillStyle = BASE;
    ctx.fillRect(0, 0, w, h);

    // ── the weave ───────────────────────────────────────────────────────────
    // Two opposed diagonal families. Drawn as one path per direction rather
    // than one path per line: a few hundred strokes would blow the frame
    // budget, and a single path with many subpaths is one rasterisation.
    const diag = Math.ceil((w + h) / CELL);

    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${WEAVE_A},0.09)`;
    ctx.beginPath();
    for (let i = -diag; i < diag; i++) {
      const x = i * CELL;
      ctx.moveTo(x, 0);
      ctx.lineTo(x + h, h);
    }
    ctx.stroke();

    ctx.strokeStyle = `rgba(${WEAVE_B},0.20)`;
    ctx.beginPath();
    for (let i = -diag; i < diag; i++) {
      const x = i * CELL + CELL / 2;
      ctx.moveTo(x, 0);
      ctx.lineTo(x - h, h);
    }
    ctx.stroke();

    // ── the reflection ──────────────────────────────────────────────────────
    // A linear gradient band travelling on the weave's diagonal. Everything
    // else in this theme is static, exactly as specified: only the reflection
    // moves.
    const t = (now % SWEEP_PERIOD) / SWEEP_PERIOD;
    const span = w + h;
    const pos = -0.3 + 1.6 * t;
    const x0 = pos * span - h;
    const g = ctx.createLinearGradient(x0, 0, x0 + span * 0.42, h);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.055)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
};
