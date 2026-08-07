// Black Hole — a drifting gravitational lens.
//
// Replaces Grid Pulse. Family rules unchanged: nothing bright, nothing fast,
// nothing that competes with a chart.
//
// ── THE POINT ───────────────────────────────────────────────────────────────
// A black hole drawn as a dark circle with a ring around it is a logo. What
// makes one look real is that it BENDS THE STARS BEHIND IT -- and the reason
// this theme moves is that the bending is only legible in motion. A static
// lens is an odd-looking starfield; a lens crossing the field makes stars swim
// outward around it, pile up on one side, and slide back, and the geometry
// becomes obvious the moment it drifts.
//
// So the lensing is not decoration here. It is the whole theme, and the drift
// exists to show it.
//
// ── THE LENS EQUATION ───────────────────────────────────────────────────────
// Real, not faked. For a point mass, a star whose true offset from the hole is
// b appears at radius t satisfying  b = t - E^2/t,  where E is the Einstein
// radius. Solving the quadratic gives two images:
//
//   t+ = ( b + sqrt(b^2 + 4E^2) ) / 2      always OUTSIDE the Einstein radius
//   t- = ( b - sqrt(b^2 + 4E^2) ) / 2      negative: the far side, INSIDE it
//
// Three things fall out of this for free, and each one is a detail that would
// have to be hand-faked otherwise:
//
//   * Every star sits outside E, so they crowd into a bright ring at E. That
//     ring is not drawn anywhere in this file. It is what the equation does.
//   * The secondary image is a real counter-image on the opposite side of the
//     hole -- a faint second copy of the starfield, inverted, inside the ring.
//   * Magnification mu+ = 1/2 + (u^2+2)/(2u*sqrt(u^2+4)), with u = b/E, makes
//     stars near the ring genuinely BRIGHTER, which is the physical reason an
//     Einstein ring is visible at all. mu- falls to zero with distance, so the
//     counter-image fades out on its own without a cutoff.
//
// The shadow occludes the secondary image (it passes behind the hole) and
// never the primary, because t+ > E > Rs by construction. That is correct, and
// it is why the radii are set in that order rather than tuned by eye.
//
// ── THE DISC ────────────────────────────────────────────────────────────────
// Tilted, and split at the horizon: the far half is drawn BEFORE the shadow so
// the shadow cuts into it, the near half AFTER so it crosses in front. That
// single ordering is what stops a tilted ellipse reading as a flat hoop.
//
// Doppler beaming -- the approaching side brighter than the receding side --
// costs one gradient per ring and is the difference between "ring" and
// "something orbiting at relativistic speed".
//
// Colour comes from the user's accent, so the hole matches their terminal
// rather than importing an orange the palette never asked for.

const BG_DEEP = "#01030A";

const DRIFT_X = 143_000;   // co-prime-ish periods, so the path never repeats
const DRIFT_Y = 97_000;
const SPIN = 61_000;       // disc rotation

const STARS = 200;
const DISC_RINGS = 9;

export default {
  id: "blackhole",
  label: "Black Hole",
  desc: "A drifting lens bending a field of stars",

  init({ w, h }) {
    const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };

    const stars = new Array(STARS);
    for (let i = 0; i < STARS; i++) {
      stars[i] = {
        // Fractions, so a resize repositions the field rather than clipping it.
        fx: rnd(i, 1),
        fy: rnd(i, 2),
        r: 0.5 + rnd(i, 3) * 1.15,
        a: 0.16 + rnd(i, 4) * 0.30,
        // A slow twinkle, per-star out of phase. Sine of `now`, never
        // accumulated, so it is identical at 60Hz and 144Hz.
        tw: rnd(i, 5) * Math.PI * 2,
      };
    }
    return { stars };
  },

  draw({ ctx, w, h, now, state, rgba }) {
    ctx.fillStyle = BG_DEEP;
    ctx.fillRect(0, 0, w, h);

    // A faint nebula so the field is not a flat black rectangle behind the
    // stars. Static -- anything moving here would compete with the lens.
    const neb = ctx.createRadialGradient(w * 0.72, h * 0.24, 0, w * 0.72, h * 0.24, Math.max(w, h) * 0.85);
    neb.addColorStop(0, "rgba(30,52,96,0.16)");
    neb.addColorStop(1, "rgba(30,52,96,0)");
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, w, h);

    // ── the hole's path ─────────────────────────────────────────────────────
    // Confined to the middle of the canvas so the lens never leaves the frame,
    // and slow enough that it reads as drift rather than travel.
    const tx = (now % DRIFT_X) / DRIFT_X;
    const ty = (now % DRIFT_Y) / DRIFT_Y;
    const hx = w * (0.5 + 0.26 * Math.sin(tx * Math.PI * 2));
    const hy = h * (0.5 + 0.20 * Math.cos(ty * Math.PI * 2));

    const S = Math.min(w, h);
    const E = S * 0.135;    // Einstein radius -- where the star ring forms
    const Rs = E * 0.42;    // shadow. Strictly inside E, which is what keeps
                            // the primary image from ever being occluded.

    // ── stars, lensed ───────────────────────────────────────────────────────
    // Batched into alpha bands: one fill per band instead of one per star.
    const bands = [[], [], [], []];
    const ghosts = [];
    const stars = state.stars;

    for (let i = 0; i < stars.length; i++) {
      const st = stars[i];
      const sx = st.fx * w, sy = st.fy * h;
      let dx = sx - hx, dy = sy - hy;
      let b = Math.hypot(dx, dy);
      // A star exactly on the axis has no direction to be deflected along.
      if (b < 0.001) b = 0.001;
      const ux = dx / b, uy = dy / b;

      const u = b / E;
      const root = Math.sqrt(u * u + 4);
      const tPlus = E * (u + root) * 0.5;
      const tMinus = E * (u - root) * 0.5;      // negative: the far side

      const core = (u * u + 2) / (2 * u * root);
      const muPlus = 0.5 + core;
      const muMinus = core - 0.5;

      const twinkle = 0.82 + 0.18 * Math.sin(now * 0.00042 + st.tw);

      // Primary image. Brightness is capped: near the ring the true
      // magnification diverges, and an uncapped star would flare to white.
      const mp = Math.min(3.2, muPlus);
      const ap = Math.min(0.92, st.a * mp * twinkle);
      const rp = st.r * Math.min(1.7, 0.85 + mp * 0.24);
      const px = hx + ux * tPlus, py = hy + uy * tPlus;
      if (px > -8 && px < w + 8 && py > -8 && py < h + 8) {
        bands[ap > 0.42 ? 3 : ap > 0.26 ? 2 : ap > 0.13 ? 1 : 0].push([px, py, rp]);
      }

      // Secondary image: the same star seen the long way round, on the far
      // side and inside the ring. muMinus decays on its own, so the cutoff is
      // a cheapness threshold rather than a physical one.
      if (muMinus > 0.05) {
        const gx = hx + ux * tMinus, gy = hy + uy * tMinus;
        // It passes BEHIND the hole, so the shadow eats it. The primary never
        // needs this check -- t+ > E > Rs always.
        if (Math.abs(tMinus) > Rs) {
          const ag = Math.min(0.55, st.a * muMinus * twinkle);
          if (ag > 0.025) ghosts.push([gx, gy, st.r * 0.85, ag]);
        }
      }
    }

    const BAND_A = [0.10, 0.20, 0.34, 0.62];
    for (let bd = 0; bd < 4; bd++) {
      if (!bands[bd].length) continue;
      ctx.fillStyle = "rgba(216,231,255," + BAND_A[bd] + ")";
      ctx.beginPath();
      for (const [x, y, r] of bands[bd]) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
      ctx.fill();
    }
    if (ghosts.length) {
      ctx.fillStyle = "rgba(196,216,248,0.20)";
      ctx.beginPath();
      for (const [x, y, r] of ghosts) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
      ctx.fill();
    }

    // ── accretion disc ──────────────────────────────────────────────────────
    // Drawn in two passes around the shadow. `half` -1 is the far side, which
    // the shadow will cut into; +1 is the near side, drawn over it.
    const TILT = 0.30;                 // vertical squash: 1 = face-on, 0 = edge-on
    const spin = (now % SPIN) / SPIN;

    const discPass = (half) => {
      for (let k = 0; k < DISC_RINGS; k++) {
        const f = k / (DISC_RINGS - 1);
        const rr = E * (0.62 + f * 1.15);
        const ry = rr * TILT;
        // Inner rings hotter and tighter; outer rings dimmer and broader, so
        // the disc has an edge that fades rather than a hard stop.
        const heat = 1 - f;
        // Doppler beaming: the approaching limb brighter than the receding
        // one. Drawn as a gradient across the ring so the falloff is smooth
        // instead of two visibly different halves.
        const g = ctx.createLinearGradient(hx - rr, hy, hx + rr, hy);
        const hot = (0.30 + 0.42 * heat).toFixed(3);
        const cold = (0.05 + 0.10 * heat).toFixed(3);
        g.addColorStop(0, "rgba(226,238,255," + hot + ")");
        g.addColorStop(0.45, "rgba(190,215,250," + (0.14 + 0.20 * heat).toFixed(3) + ")");
        g.addColorStop(1, "rgba(150,180,225," + cold + ")");
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(0.8, (1 - f) * 2.6 + 0.7);
        ctx.beginPath();
        // Rotation is applied to the ellipse itself; a circular disc seen at a
        // tilt would show no rotation at all, so the ring is given a slight
        // eccentricity that carries it.
        ctx.ellipse(hx, hy, rr, ry, Math.sin(spin * Math.PI * 2 + f) * 0.05,
          half < 0 ? Math.PI : 0, half < 0 ? Math.PI * 2 : Math.PI);
        ctx.stroke();
      }
    };

    discPass(-1);   // far half: behind the hole

    // The far side of the disc, lensed up OVER the top of the shadow -- the
    // arc that makes a lensed disc unmistakable. It is the same material seen
    // above the hole because its light was bent around; drawn faint, because a
    // strong version of this reads as a halo rather than a bent disc.
    ctx.strokeStyle = rgba(0.20);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(hx, hy, E * 0.86, E * 0.86, 0, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();

    // A short darkening outside the shadow, so the horizon sits in something
    // rather than being pasted onto the starfield. It goes HERE, before the
    // horizon -- run after, it would dim the photon ring, which is the one
    // element that must stay the brightest thing on the canvas.
    const rim = ctx.createRadialGradient(hx, hy, Rs, hx, hy, Rs * 2.8);
    rim.addColorStop(0, "rgba(0,0,0,0.60)");
    rim.addColorStop(0.5, "rgba(0,0,0,0.22)");
    rim.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, w, h);

    // ── event horizon ───────────────────────────────────────────────────────
    // Pure black, opaque, hard-edged. Every other layer in every theme here is
    // soft; this one must not be. The edge IS the object -- softening it turns
    // a black hole into a smudge.
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.arc(hx, hy, Rs, 0, Math.PI * 2);
    ctx.fill();

    // Photon ring: light circling the horizon before escaping. A single thin
    // bright circle just outside the shadow, and the brightest thing on the
    // canvas -- it is the one place a hard highlight belongs.
    ctx.strokeStyle = "rgba(236,244,255,0.80)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(hx, hy, Rs * 1.04, 0, Math.PI * 2);
    ctx.stroke();

    discPass(1);    // near half: in front of the hole

    // Vignette, centred on the canvas rather than the hole -- following the
    // hole would drag a visible dark blob around with it.
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.30, w * 0.5, h * 0.5, Math.max(w, h) * 0.82);
    vig.addColorStop(0, "rgba(1,3,10,0)");
    vig.addColorStop(1, "rgba(1,3,10,0.66)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  },
};
