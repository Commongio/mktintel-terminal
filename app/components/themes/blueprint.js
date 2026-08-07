// Blueprint — engineering workspace.
//
// ── WHY THE FIRST VERSION FAILED ────────────────────────────────────────────
// A flat grid at uniform alpha across the whole canvas. Technically correct
// and visually inert: a grid with no depth reads as a texture swatch, not a
// drafting surface. Nothing anchored the eye, and the scan band was a
// translucent rectangle sliding over the top rather than something the grid
// reacted to.
//
// Three changes carry this version:
//
//   1. The grid is LIT, not painted. Line alpha falls off with distance from
//      a drafting-lamp position, so the surface has a near corner and a far
//      one. That single gradient is the difference between a swatch and a
//      table you are standing at.
//   2. The scan brightens the grid it passes over instead of washing it. The
//      band is drawn as a second pass of the same lines at higher alpha,
//      clipped to the band -- so lines light up and the space between them
//      does not.
//   3. Axes. One major horizontal and one major vertical run brighter than the
//      rest, giving the composition an origin. A blueprint without datum lines
//      is graph paper.

const BG_TOP = "#03101D";
const BG_BOTTOM = "#061E30";
const LINE = "22,84,132";
const AXIS = "38,120,178";

const MAJOR = 120;
const MINOR = 24;
const SCAN_PERIOD = 34_000;
const MARKS = 11;

export default {
  id: "blueprint",
  label: "Blueprint",
  desc: "Lit drafting grid with a scanning pass",

  init({ w, h }) {
    const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
    const marks = new Array(MARKS);
    for (let i = 0; i < MARKS; i++) {
      marks[i] = {
        // Snapped to the major grid: an annotation that ignores its own grid
        // reads as a smudge rather than a notation.
        fx: (1 + Math.floor(rnd(i, 1) * 12)) / 14,
        fy: (1 + Math.floor(rnd(i, 2) * 7)) / 9,
        kind: Math.floor(rnd(i, 3) * 4),
        size: 16 + rnd(i, 4) * 26,
        phase: rnd(i, 5),
        rate: 0.55 + rnd(i, 6) * 0.8,
      };
    }
    return { marks };
  },

  draw({ ctx, w, h, now, state, rgba }) {
    const bg = ctx.createLinearGradient(0, 0, w * 0.3, h);
    bg.addColorStop(0, BG_TOP);
    bg.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // The lamp. Drifts very slowly, so the lit corner migrates over minutes
    // and the surface never looks like a static image.
    const lt = (now % 210_000) / 210_000;
    const lampX = w * (0.22 + 0.5 * (0.5 + 0.5 * Math.sin(lt * Math.PI * 2)));
    const lampY = h * (0.18 + 0.3 * (0.5 + 0.5 * Math.cos(lt * Math.PI * 2 * 0.7)));

    // Grid drawn in bands, each at its own alpha. Six bands is enough for the
    // falloff to look continuous and keeps this to a dozen stroke calls.
    const BANDS = 6;
    const maxD = Math.hypot(w, h);

    for (let b = 0; b < BANDS; b++) {
      const t0 = b / BANDS, t1 = (b + 1) / BANDS;
      const lit = 1 - (t0 + t1) / 2;                 // near the lamp = brighter
      const minorA = 0.045 + lit * 0.075;
      const majorA = 0.085 + lit * 0.150;

      ctx.save();
      ctx.beginPath();
      ctx.arc(lampX, lampY, maxD * t1, 0, Math.PI * 2);
      if (b > 0) ctx.arc(lampX, lampY, maxD * t0, 0, Math.PI * 2, true);
      ctx.clip();

      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${LINE},${minorA})`;
      ctx.beginPath();
      for (let x = 0; x <= w; x += MINOR) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = 0; y <= h; y += MINOR) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();

      ctx.strokeStyle = `rgba(${LINE},${majorA})`;
      ctx.beginPath();
      for (let x = 0; x <= w; x += MAJOR) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = 0; y <= h; y += MAJOR) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
      ctx.restore();
    }

    // Datum lines. An origin, so the grid is a drawing rather than paper.
    const ax = Math.round(w * 0.5 / MAJOR) * MAJOR;
    const ay = Math.round(h * 0.5 / MAJOR) * MAJOR;
    ctx.strokeStyle = `rgba(${AXIS},0.26)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, 0); ctx.lineTo(ax, h);
    ctx.moveTo(0, ay); ctx.lineTo(w, ay);
    ctx.stroke();

    // Abstract markings. No text and no symbols: legible content in a backdrop
    // invites reading, which is what this must never pull attention into.
    for (const m of state.marks) {
      const cyc = (now / (15_000 * m.rate) + m.phase) % 1;
      const s = Math.sin(cyc * Math.PI);
      const lit = s * s * s;
      if (lit < 0.02) continue;

      const x = m.fx * w, y = m.fy * h, r = m.size;
      ctx.strokeStyle = rgba(0.40 * lit);
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (m.kind === 0) {
        ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
        ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
        ctx.moveTo(x + r * 0.4, y); ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
      } else if (m.kind === 1) {
        for (let i = 0; i < 6; i++) {
          const tx = x + i * (r / 3.5);
          ctx.moveTo(tx, y - (i % 2 ? 4 : 9));
          ctx.lineTo(tx, y + (i % 2 ? 4 : 9));
        }
      } else if (m.kind === 2) {
        ctx.arc(x, y, r, -0.95, 0.95);
        ctx.moveTo(x, y - r * 0.28); ctx.lineTo(x, y + r * 0.28);
      } else {
        // Dimension bracket: two ticks and a span. The most "engineering" of
        // the four and the reason a fourth kind exists.
        ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7);
        ctx.moveTo(x + r, y - 7); ctx.lineTo(x + r, y + 7);
        ctx.moveTo(x, y); ctx.lineTo(x + r, y);
      }
      ctx.stroke();
    }

    // ── the scan ────────────────────────────────────────────────────────────
    // A second pass of the SAME lines at higher alpha, clipped to a moving
    // band. The grid brightens as it passes; the gaps stay dark. A translucent
    // rectangle would have lifted both, which is why the first version read as
    // a sheet of glass sliding by.
    const st = (now % SCAN_PERIOD) / SCAN_PERIOD;
    const bandC = -0.15 * w + 1.3 * w * st;
    const bandW = w * 0.11;

    ctx.save();
    ctx.beginPath();
    ctx.rect(bandC - bandW, 0, bandW * 2, h);
    ctx.clip();

    const fade = ctx.createLinearGradient(bandC - bandW, 0, bandC + bandW, 0);
    fade.addColorStop(0, rgba(0));
    fade.addColorStop(0.5, rgba(0.34));
    fade.addColorStop(1, rgba(0));

    ctx.strokeStyle = fade;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = Math.floor((bandC - bandW) / MINOR) * MINOR; x <= bandC + bandW; x += MINOR) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y <= h; y += MINOR) { ctx.moveTo(bandC - bandW, y); ctx.lineTo(bandC + bandW, y); }
    ctx.stroke();
    ctx.restore();
  },
};
