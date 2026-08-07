// Globe — a slowly turning wireframe world shedding light into the dark.
//
// Replaces Blueprint. Same family rules: nothing bright, nothing fast, nothing
// that competes with a chart.
//
// ── THE TWO THINGS THAT MAKE IT READ AS A SPHERE ────────────────────────────
//
// 1. DEPTH-SORTED ALPHA. Every latitude ring and meridian is drawn at an
//    opacity derived from how far it sits from the viewer. Without that a
//    wireframe globe is a flat mandala — the outline is identical whether the
//    lines are in front of the centre or behind it, and only brightness tells
//    you which. This is the whole illusion.
//
// 2. THE LIMB. Lines crowd toward the silhouette edge because that is where
//    the surface turns away, so the rim reads brighter than the face. Getting
//    it for free from an orthographic projection is why the projection is
//    orthographic and not perspective.
//
// ── STARS ───────────────────────────────────────────────────────────────────
// Each star leaves the surface at a deterministic point and time, travels
// radially outward, and fades. `draw()` stays pure because a star's entire
// life is a function of its index and `now`: star 40 is always born at the
// same instant at the same latitude, on every machine and after every resize.
// Nothing is stored, nothing is spawned.
//
// Emission is biased toward the limb, where a departing particle is moving
// across the view rather than straight at it — a star launched from the centre
// of the disc barely appears to move at all.

const BG_CORE = "#061119";   // under the globe
const BG_FIELD = "#03070E";
const BG_EDGE = "#020509";

const SPIN_PERIOD = 165_000;   // one full turn, slow enough to feel geological
const RINGS = 7;               // latitude circles
const MERIDIANS = 12;
const SEGMENTS = 48;           // per line — smooth at any size, still one path

const STARS = 150;
const STAR_LIFE = 9_000;
const STAR_STAGGER = 62;       // ms between births, so they never pulse together

export default {
  id: "globe",
  label: "Globe",
  desc: "A turning wireframe world shedding stars",

  init({ w, h }) {
    const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };

    const stars = new Array(STARS);
    for (let i = 0; i < STARS; i++) {
      // Latitude biased away from the poles: a uniform sphere sample crowds
      // the caps, and the caps are the least interesting part of the view.
      const lat = (rnd(i, 1) - 0.5) * Math.PI * 0.82;
      stars[i] = {
        lat,
        lon: rnd(i, 2) * Math.PI * 2,
        born: rnd(i, 3) * STAR_LIFE + i * STAR_STAGGER,
        speed: 0.55 + rnd(i, 4) * 0.85,
        size: 0.7 + rnd(i, 5) * 1.1,
        // Slight drift in latitude as it climbs, so the field fans out rather
        // than firing along perfect radii.
        drift: (rnd(i, 6) - 0.5) * 0.22,
      };
    }
    return { stars };
  },

  draw({ ctx, w, h, now, state, rgba }) {
    const bg = ctx.createRadialGradient(w * 0.30, h * 0.52, 0, w * 0.30, h * 0.52, Math.max(w, h) * 0.95);
    bg.addColorStop(0, BG_CORE);
    bg.addColorStop(0.5, BG_FIELD);
    bg.addColorStop(1, BG_EDGE);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Held left of centre and slightly low, so the densest part of the
    // wireframe never sits behind the panels a trader is reading.
    const cx = w * 0.30;
    const cy = h * 0.54;
    const R = Math.min(w, h) * 0.40;

    const spin = ((now % SPIN_PERIOD) / SPIN_PERIOD) * Math.PI * 2;
    // A fixed axial tilt. A globe spinning about a perfectly vertical axis
    // looks like a diagram; tilt it and it looks like a planet.
    const TILT = 0.38;
    const ct = Math.cos(TILT), st = Math.sin(TILT);

    // Sphere point -> screen, orthographic. Returns depth so the caller can
    // fade by it.
    const project = (lat, lon) => {
      const cl = Math.cos(lat), sl = Math.sin(lat);
      const a = lon + spin;
      let X = cl * Math.cos(a);
      let Y = sl;
      let Z = cl * Math.sin(a);
      // Tilt about X.
      const Y2 = Y * ct - Z * st;
      const Z2 = Y * st + Z * ct;
      return [cx + X * R, cy - Y2 * R, Z2];
    };

    // ── atmosphere ──────────────────────────────────────────────────────────
    // Drawn before the wireframe so the lines sit inside it. Gives the sphere
    // volume without drawing a filled disc, which would read as a hole.
    const atmo = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R * 1.28);
    atmo.addColorStop(0, rgba(0.055));
    atmo.addColorStop(0.72, rgba(0.028));
    atmo.addColorStop(1, rgba(0));
    ctx.fillStyle = atmo;
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 1;

    // ── latitude rings ──────────────────────────────────────────────────────
    // One path per ring, alpha from its mean depth. Back half stays visible
    // but clearly behind — a fully hidden back face makes a wireframe look
    // like a bowl.
    for (let i = 1; i < RINGS; i++) {
      const lat = -Math.PI / 2 + (i / RINGS) * Math.PI;
      let front = 0;
      ctx.beginPath();
      for (let s = 0; s <= SEGMENTS; s++) {
        const [x, y, z] = project(lat, (s / SEGMENTS) * Math.PI * 2);
        front += z;
        s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const d = front / (SEGMENTS + 1);              // -1 back .. +1 front
      ctx.strokeStyle = rgba(0.07 + 0.20 * (d * 0.5 + 0.5));
      ctx.stroke();
    }

    // ── meridians ───────────────────────────────────────────────────────────
    // A meridian is one continuous pole-to-pole arc, so it needs no split: the
    // path never wraps. The latitude rings do close on themselves, which is why
    // they run the full 2*PI above.
    for (let m = 0; m < MERIDIANS; m++) {
      const lon = (m / MERIDIANS) * Math.PI * 2;
      let front = 0;
      ctx.beginPath();
      for (let s = 0; s <= SEGMENTS; s++) {
        const lat = -Math.PI / 2 + (s / SEGMENTS) * Math.PI;
        const [x, y, z] = project(lat, lon);
        front += z;
        s === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const d = front / (SEGMENTS + 1);
      ctx.strokeStyle = rgba(0.055 + 0.17 * (d * 0.5 + 0.5));
      ctx.stroke();
    }

    // ── the limb ────────────────────────────────────────────────────────────
    // A single bright circle at the silhouette. The wireframe alone leaves the
    // edge ragged where lines cross it; this closes the form.
    ctx.strokeStyle = rgba(0.30);
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // ── stars ───────────────────────────────────────────────────────────────
    // Batched into three alpha bands: one fill call each rather than one per
    // star. 150 arcs in three paths instead of 150 fills.
    const bands = [[], [], []];
    for (let i = 0; i < state.stars.length; i++) {
      const s = state.stars[i];
      // Life is a pure function of index and now — nothing spawned, nothing
      // stored, and identical after a resize or a tab-hidden pause.
      const age = (now - s.born) % (STAR_LIFE * 2.4);
      if (age < 0 || age > STAR_LIFE) continue;
      const t = age / STAR_LIFE;

      const [px, py, pz] = project(s.lat + s.drift * t, s.lon);
      // Emission is biased toward the limb: a star leaving the centre of the
      // disc moves almost directly at the viewer and appears not to move.
      const limb = 1 - Math.abs(pz);
      if (limb < 0.18) continue;

      // Radial climb, easing out — fast off the surface, slowing as it goes.
      const climb = 1 + Math.pow(t, 0.72) * 0.55 * s.speed;
      const sx = cx + (px - cx) * climb;
      const sy = cy + (py - cy) * climb;

      // Fade in quickly, out slowly. Never blinks: alpha is continuous at both
      // ends of the life.
      const fade = Math.min(1, t * 6) * (1 - t) * (1 - t);
      const a = fade * (0.35 + 0.45 * limb) * (pz > 0 ? 1 : 0.42);
      if (a < 0.02) continue;

      bands[a > 0.26 ? 2 : a > 0.13 ? 1 : 0].push([sx, sy, s.size * (0.7 + 0.5 * limb)]);
    }

    const BAND_A = [0.10, 0.20, 0.36];
    for (let b = 0; b < 3; b++) {
      if (!bands[b].length) continue;
      ctx.fillStyle = "rgba(214,232,255," + BAND_A[b] + ")";
      ctx.beginPath();
      for (const [x, y, r] of bands[b]) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Vignette, weighted to the right so the panel side stays quietest.
    const vig = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, Math.max(w, h) * 0.95);
    vig.addColorStop(0, "rgba(2,5,9,0)");
    vig.addColorStop(1, "rgba(2,5,9,0.62)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  },
};
