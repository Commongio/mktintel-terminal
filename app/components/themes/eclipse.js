// Eclipse — cinematic depth.
//
// ── WHY THE FIRST VERSION FAILED ────────────────────────────────────────────
// It layered a soft light gradient, then painted a soft BLACK gradient over
// the top at 0.55. Black over near-black subtracts nothing you can see, so the
// two cancelled and left an almost uniform field. There was no eclipse in it,
// only two washes.
//
// An eclipse is not a dark area. It is a HARD EDGE with light escaping past
// it -- the whole drama is the contrast across a terminator only a few pixels
// wide. So this version draws an actual occluding body: a disc, mostly
// off-screen, with a bright rim where the light grazes its limb and a corona
// falling away behind it.
//
// The body stays off-screen as the bible requires. You see a curve and the
// light around it, never the sphere.

const BG_TOP = "#010203";
const BG_MID = "#04070A";
const BG_BOTTOM = "#0A1118";

const ORBIT_PERIOD = 120_000;   // bible: 120s
const DUST = 160;

export default {
  id: "eclipse",
  label: "Eclipse",
  desc: "An unseen body, its rim lit from behind",

  init({ w, h }) {
    const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
    const dust = new Array(DUST);
    for (let i = 0; i < DUST; i++) {
      dust[i] = {
        fx: rnd(i, 1), fy: rnd(i, 2),
        r: 0.4 + rnd(i, 3) * 1.0,
        a: 0.16 + rnd(i, 4) * 0.16,
        vx: ((rnd(i, 5) - 0.5) * 0.018) / 16.67,
        vy: ((rnd(i, 6) - 0.5) * 0.018) / 16.67,
      };
    }
    return { dust };
  },

  draw({ ctx, w, h, now, state, rgba }) {
    const bg = ctx.createLinearGradient(0, h, w, 0);
    bg.addColorStop(0, BG_TOP);
    bg.addColorStop(0.6, BG_MID);
    bg.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // The body. Centre held off the bottom-left corner; it drifts along a
    // shallow arc so the lit limb sweeps slowly across the lower third.
    const t = (now % ORBIT_PERIOD) / ORBIT_PERIOD;
    const ang = t * Math.PI * 2;
    const R = Math.max(w, h) * 0.82;
    const bxc = w * (0.30 + 0.10 * Math.sin(ang)) - R * 0.55;
    const byc = h * (0.92 + 0.06 * Math.cos(ang)) + R * 0.42;

    // Light sits behind and above the body, so the rim lights on its upper
    // right -- the side facing into the screen.
    const la = ang + 0.9;
    const lx = bxc + Math.cos(la) * R * 1.55;
    const ly = byc + Math.sin(la) * R * 1.55;

    // ── corona ──────────────────────────────────────────────────────────────
    // Light escaping past the limb. Drawn BEFORE the body so the body cuts
    // into it -- that occlusion is the entire effect.
    const cor = ctx.createRadialGradient(lx, ly, 0, lx, ly, R * 1.9);
    cor.addColorStop(0, rgba(0.30));
    cor.addColorStop(0.22, rgba(0.13));
    cor.addColorStop(0.55, rgba(0.045));
    cor.addColorStop(1, rgba(0));
    ctx.fillStyle = cor;
    ctx.fillRect(0, 0, w, h);

    // ── the body ────────────────────────────────────────────────────────────
    // Near-black, but NOT pure: a faint interior gradient keeps it from
    // reading as a hole punched in the canvas.
    const bodyG = ctx.createRadialGradient(bxc, byc, R * 0.55, bxc, byc, R);
    bodyG.addColorStop(0, "#000102");
    bodyG.addColorStop(0.86, "#000203");
    bodyG.addColorStop(1, "#010406");
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    ctx.arc(bxc, byc, R, 0, Math.PI * 2);
    ctx.fill();

    // ── the rim ─────────────────────────────────────────────────────────────
    // The whole theme. A bright arc clipped to the limb, brightest where the
    // surface faces the light and falling to nothing at the terminator.
    ctx.save();
    ctx.beginPath();
    ctx.arc(bxc, byc, R * 1.012, 0, Math.PI * 2);
    ctx.arc(bxc, byc, R * 0.972, 0, Math.PI * 2, true);
    ctx.clip();

    const rimG = ctx.createRadialGradient(lx, ly, 0, lx, ly, R * 1.8);
    rimG.addColorStop(0, rgba(0.95));
    rimG.addColorStop(0.35, rgba(0.55));
    rimG.addColorStop(0.75, rgba(0.10));
    rimG.addColorStop(1, rgba(0));
    ctx.fillStyle = rimG;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // A soft bloom sitting on the rim, so the edge glows rather than looking
    // like a drawn stroke.
    ctx.save();
    ctx.beginPath();
    ctx.arc(bxc, byc, R * 1.10, 0, Math.PI * 2);
    ctx.arc(bxc, byc, R * 0.94, 0, Math.PI * 2, true);
    ctx.clip();
    const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, R * 1.8);
    glow.addColorStop(0, rgba(0.22));
    glow.addColorStop(0.5, rgba(0.06));
    glow.addColorStop(1, rgba(0));
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // ── dust ────────────────────────────────────────────────────────────────
    // Above the body, so motes crossing the dark limb stay visible and give
    // the silhouette a foreground to sit behind.
    const dust = state.dust;
    ctx.fillStyle = "rgba(214,230,250,1)";
    for (let i = 0; i < dust.length; i++) {
      const p = dust[i];
      const x = ((((p.fx + (p.vx * now) / w) % 1) + 1) % 1) * w;
      const y = ((((p.fy + (p.vy * now) / h) % 1) + 1) % 1) * h;
      // Motes near the light catch more of it -- a cheap depth cue that costs
      // one distance check.
      const d = Math.hypot(x - lx, y - ly) / (R * 1.6);
      ctx.globalAlpha = p.a * (0.45 + 0.75 * Math.max(0, 1 - d));
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Vignette. Pulls the corners down so the rim is unmistakably the
    // brightest thing on screen.
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.30, w * 0.5, h * 0.45, Math.max(w, h) * 0.85);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  },
};
