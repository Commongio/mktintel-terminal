// Blueprint — engineering workspace.
//
// "Working inside an advanced research lab." The grid should almost disappear
// behind the UI until someone intentionally looks for it.
//
// ── DEVIATION: GRID OPACITY RAISED ──────────────────────────────────────────
// The bible asks for 2-4%: 5 to 10 out of 255. That is the exact band that
// made aurora invisible and produced the "themes stopped displaying" report.
// Minor lines are at 0.055 and majors at 0.10 -- still far below anything else
// in the collection, and "almost disappears" rather than "does".
//
// The markings are deliberately abstract: crosshairs, tick clusters and arcs.
// No text, no symbols, nothing a viewer can try to read. A backdrop with
// legible content invites reading, and reading is exactly what this must not
// pull attention into.

const BG_TOP = "#03101D";
const BG_BOTTOM = "#07253A";
const LINE = "16,61,97";        // #103D61

const MAJOR = 120;              // bible: 120px
const MINOR = 24;               // bible: 24px
const SCAN_PERIOD = 38_000;     // bible: 30-45s
const MARKS = 9;

export default {
  id: "blueprint",
  label: "Blueprint",
  desc: "Technical grid with a slow scanning pulse",

  init({ w, h }) {
    const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
    const marks = new Array(MARKS);
    for (let i = 0; i < MARKS; i++) {
      marks[i] = {
        // Snapped to the major grid, because a blueprint annotation that
        // ignores its own grid reads as a smudge rather than a notation.
        fx: Math.round(rnd(i, 1) * 12) / 12,
        fy: Math.round(rnd(i, 2) * 8) / 8,
        kind: Math.floor(rnd(i, 3) * 3),
        size: 14 + rnd(i, 4) * 22,
        phase: rnd(i, 5),
        rate: 0.5 + rnd(i, 6) * 0.7,
      };
    }
    return { marks };
  },

  draw({ ctx, w, h, now, state, rgba }) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, BG_TOP);
    bg.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Both grids batched into one path each: ~150 lines at 1080p, but two
    // rasterisations rather than 150.
    ctx.lineWidth = 1;

    ctx.strokeStyle = `rgba(${LINE},0.055)`;
    ctx.beginPath();
    for (let x = 0; x <= w; x += MINOR) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += MINOR) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    ctx.strokeStyle = `rgba(${LINE},0.10)`;
    ctx.beginPath();
    for (let x = 0; x <= w; x += MAJOR) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += MAJOR) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();

    // Abstract markings, fading independently.
    for (const m of state.marks) {
      const cyc = (now / (17_000 * m.rate) + m.phase) % 1;
      const s = Math.sin(cyc * Math.PI);
      const lit = s * s * s;
      if (lit < 0.02) continue;

      const x = m.fx * w, y = m.fy * h, r = m.size;
      ctx.strokeStyle = rgba(0.26 * lit);
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (m.kind === 0) {
        ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
        ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
        ctx.moveTo(x + r * 0.45, y); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
      } else if (m.kind === 1) {
        for (let i = 0; i < 5; i++) {
          const tx = x + i * (r / 3);
          ctx.moveTo(tx, y - (i % 2 ? 4 : 8));
          ctx.lineTo(tx, y + (i % 2 ? 4 : 8));
        }
      } else {
        ctx.arc(x, y, r, -0.9, 0.9);
        ctx.moveTo(x, y - r * 0.3); ctx.lineTo(x, y + r * 0.3);
      }
      ctx.stroke();
    }

    // The scan. A single soft band traversing the screen, brightening the grid
    // beneath it rather than drawing anything of its own.
    const t = (now % SCAN_PERIOD) / SCAN_PERIOD;
    const bandX = -0.2 * w + 1.4 * w * t;
    const g = ctx.createLinearGradient(bandX - w * 0.18, 0, bandX + w * 0.18, 0);
    g.addColorStop(0, rgba(0));
    g.addColorStop(0.5, rgba(0.075));
    g.addColorStop(1, rgba(0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  },
};
