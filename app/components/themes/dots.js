// Dots — a field of dots with a wave travelling through it.
//
// Ported from VANTA.DOTS. Vanta could not come in: it is two CDN script tags
// (three.js r134 plus vanta.dots.min.js) for a backdrop, and this registry has
// no external dependencies. The effect is a few dozen lines of math, so it was
// rebuilt rather than imported.
//
// Deliberately 2D CANVAS, not WebGL, even though a GL points path already
// exists for `midnight`. Five hundred dots do not need a GPU, and a 2D theme
// gets the full test battery -- purity, determinism, the per-frame op budget,
// context-state restoration -- where a shader theme can only be checked by
// reading its source. Same picture, four more invariants held.
//
// ── THE FIRST VERSION WAS THE WRONG GEOMETRY ────────────────────────────────
//
// It built a ground-plane lattice receding to a horizon, and that fights
// itself. In a floor plane the near rows are the brightest and largest but are
// spaced hundreds of pixels apart, while the rows that are actually dense are
// the far ones, which are tiny and faint. Measured, it peaked at 91 of 255
// with 0.2% of pixels lit -- and the first fix, moving the front row back into
// frame, only reached 141. The constants were not the problem. A receding
// floor is simply sparse exactly where it is bright.
//
// The dots in VANTA.DOTS face the viewer. So this is a FACING field, and the
// wave is expressed the way that geometry allows:
//
//   POSITION IS A RIGID GRID. Dots do not fly around. A field of dots that
//   translates is a particle system; a field that stays put and BREATHES is a
//   surface being disturbed, which is what the effect is.
//
//   THE WAVE IS CARRIED BY SIZE AND BRIGHTNESS, not by displacement. Two
//   out-of-phase sines across the two axes give a crest that travels
//   diagonally, so the pattern never lines up with the grid it is drawn on.
//   Projecting a real 3D displacement instead would swing the outer dots by
//   ~240px at these depths -- far more motion than anything else in this
//   family, and behind a chart.
//
//   A SMALL WOBBLE, a few pixels, rides on top. Without it the grid is
//   mechanically perfect and reads as printed rather than alive.
//
// ── THE SUPPLIED CONFIG ─────────────────────────────────────────────────────
//
//   color: 0xffffff, color2: 0xffffff, backgroundColor: 0x0
//
// Vanta alternates between color and color2 across the field; this config sets
// both to white, collapsing the feature. The alternation is kept and the second
// slot carries the user's accent -- every theme here has to use it for at least
// one major element, and this is the natural place. At the default accent the
// field still reads as white-on-black.
//
// mouseControls and touchControls are NOT implemented, and that is a decision
// rather than an omission. This sits behind a trading terminal with
// pointer-events off; making the field react to the cursor while someone reads
// a chart is precisely the "competes with the chart" the family rule forbids.
// gyroControls the original already had off.

const BG_TOP = "#010206";
const BG_BOTTOM = "#04070F";

const NX = 30;
const NY = 17;              // 510 dots, all on screen — nothing is culled
const DOT_R = 2.5;          // radius at full swell
const WOBBLE = 3.2;         // px

const hash = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };

export default {
  id: "dots",
  label: "Dots",
  desc: "A field of dots with a wave travelling through it",

  init() {
    // The grid is regular by definition, so the only per-dot state is a small
    // phase jitter. Hashed rather than random: init re-runs on resize, and a
    // reshuffled field reads as the theme restarting.
    const dots = new Array(NX * NY);
    let n = 0;
    for (let iy = 0; iy < NY; iy++) {
      for (let ix = 0; ix < NX; ix++, n++) {
        dots[n] = {
          // Normalised to -1..1 so a resize restretches the field rather than
          // clipping it or leaving a margin.
          gx: (ix / (NX - 1)) * 2 - 1,
          gy: (iy / (NY - 1)) * 2 - 1,
          alt: (ix + iy) % 2 === 0,          // vanta's colour / color2
          jitter: (hash(n, 1) - 0.5) * 0.9,
        };
      }
    }
    return { dots };
  },

  draw({ ctx, w, h, now, state, rgba }) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, BG_TOP);
    bg.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const t = now / 1000;
    const cx = w * 0.5, cy = h * 0.5;
    const spanX = w * 0.53, spanY = h * 0.53;   // slight overscan: no edge gap

    // Four brightness bands per colour. Everything in a band is one path and
    // one fill, so 510 dots cost 8 fills rather than 510.
    const BANDS = 4;
    const white = Array.from({ length: BANDS }, () => []);
    const accent = Array.from({ length: BANDS }, () => []);

    const dots = state.dots;
    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];

      // Two out-of-phase sines. Different spatial frequencies on the two axes
      // and different temporal rates, so the crest travels diagonally and the
      // field never resolves into a stationary checkerboard.
      const wave = Math.sin(d.gx * 3.05 + t * 0.50 + d.jitter)
                 * Math.cos(d.gy * 2.35 - t * 0.38);
      const swell = 0.30 + 0.70 * (wave * 0.5 + 0.5);      // 0.30 .. 1.00

      // A second, slower field drives the wobble, so the dots that are bright
      // are not also the ones moving — two coupled cues read as one mechanism
      // and look artificial.
      const wob = Math.sin(d.gy * 1.9 + t * 0.31) * Math.cos(d.gx * 1.6 - t * 0.24);

      const x = cx + d.gx * spanX + wob * WOBBLE;
      const y = cy + d.gy * spanY + wave * WOBBLE * 0.7;

      // Depth cue without a projection: dots toward the centre sit slightly
      // "nearer". Subtle — enough to stop the field reading as flat wallpaper.
      const rad = Math.hypot(d.gx, d.gy) * 0.7071;
      const depth = 1 - rad * 0.30;

      const r = DOT_R * (0.45 + 0.55 * swell) * depth;
      // Exponent > 1: brightness falls faster than size, so crests read as lit
      // rather than merely larger.
      const a = Math.min(0.92, 0.92 * Math.pow(swell, 1.5) * depth);
      if (a < 0.02) continue;

      const band = Math.min(BANDS - 1, Math.floor((a / 0.92) * BANDS));
      (d.alt ? accent : white)[band].push([x, y, r]);
    }

    const paint = (groups, colorAt) => {
      for (let b = 0; b < BANDS; b++) {
        const g = groups[b];
        if (!g.length) continue;
        ctx.fillStyle = colorAt((0.92 * (b + 0.6)) / BANDS);
        ctx.beginPath();
        for (const [x, y, r] of g) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
        ctx.fill();
      }
    };
    paint(white, (al) => `rgba(228,238,251,${al.toFixed(3)})`);
    paint(accent, (al) => rgba(al * 0.95));

    // A slow bloom drifting behind the field, so the composition has a centre
    // of gravity that moves. Without it a uniform grid has nowhere to look.
    const bt = (now % 47_000) / 47_000;
    const bx = cx + Math.sin(bt * Math.PI * 2) * w * 0.22;
    const by = cy + Math.cos(bt * Math.PI * 2 * 0.73) * h * 0.18;
    const bloom = ctx.createRadialGradient(bx, by, 0, bx, by, Math.max(w, h) * 0.42);
    bloom.addColorStop(0, rgba(0.085));
    bloom.addColorStop(1, rgba(0));
    ctx.fillStyle = bloom;
    ctx.fillRect(0, 0, w, h);

    // Vignette. Keeps the corners from competing with the panels over them.
    const vig = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.30, cx, cy, Math.max(w, h) * 0.80);
    vig.addColorStop(0, "rgba(1,2,6,0)");
    vig.addColorStop(1, "rgba(1,2,6,0.58)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  },
};
