// Eclipse — cinematic depth.
//
// "A massive celestial body just outside the screen. You never see it, but you
// feel its presence through soft gradients and shifting light."
//
// The body is never drawn. What you see is the shadow it casts and the light
// escaping past it -- which is the whole idea, and the reason this is a
// subtraction of light rather than an addition of shape.
//
// ── DEVIATION ───────────────────────────────────────────────────────────────
// The palette steps (#010203 -> #040608 -> #0A1118) are 3 and 6 out of 255.
// As a smooth gradient that is fine -- gradients between near-identical darks
// read as depth rather than banding -- so the base is kept as specified. The
// ACCENT light carries the theme, and it is drawn well above the level the
// bible implies, because at 3/255 there would be nothing to see.

const BG_TOP = "#010203";
const BG_MID = "#040608";
const BG_BOTTOM = "#0A1118";

const LIGHT_PERIOD = 120_000;   // bible: 120s
const DUST = 140;

export default {
  id: "eclipse",
  label: "Eclipse",
  desc: "Cinematic depth — off-screen light and shadow",

  init({ w, h }) {
    const rnd = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
    const dust = new Array(DUST);
    for (let i = 0; i < DUST; i++) {
      dust[i] = {
        fx: rnd(i, 1), fy: rnd(i, 2),
        r: 0.5 + rnd(i, 3) * 0.9,
        a: 0.14 + rnd(i, 4) * 0.10,
        // "Almost imperceptible" -- roughly a third of Midnight's drift.
        vx: ((rnd(i, 5) - 0.5) * 0.02) / 16.67,
        vy: ((rnd(i, 6) - 0.5) * 0.02) / 16.67,
      };
    }
    return { dust };
  },

  draw({ ctx, w, h, now, state, rgba }) {
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, BG_TOP);
    bg.addColorStop(0.55, BG_MID);
    bg.addColorStop(1, BG_BOTTOM);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // The light source, off-screen, drifting along the left edge and back.
    const t = (now % LIGHT_PERIOD) / LIGHT_PERIOD;
    const ang = t * Math.PI * 2;
    const lx = w * (-0.35 + 0.12 * Math.sin(ang));
    const ly = h * (0.5 + 0.55 * Math.cos(ang));

    // Light escaping past the body: a wide, weak gradient anchored off-canvas
    // so only its falloff is ever on screen. Illuminating ONE side is what
    // makes the unseen body legible as a body.
    const lr = Math.max(w, h) * 1.35;
    const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, lr);
    lg.addColorStop(0, rgba(0.20));
    lg.addColorStop(0.42, rgba(0.07));
    lg.addColorStop(1, rgba(0));
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h);

    // The shadow. Centred opposite the light and drawn in near-black, this is
    // what gives the impression of mass: a region the light demonstrably does
    // not reach.
    const sx = w - lx * 0.6;
    const sy = h - ly;
    const sr = Math.max(w, h) * 1.1;
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg.addColorStop(0, "rgba(0,0,0,0.55)");
    sg.addColorStop(0.6, "rgba(0,0,0,0.22)");
    sg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);

    // Ultra-fine dust, above the shadow so it stays visible in the dark side.
    const dust = state.dust;
    ctx.fillStyle = "rgba(206,224,246,1)";
    for (let i = 0; i < dust.length; i++) {
      const p = dust[i];
      const x = ((((p.fx + (p.vx * now) / w) % 1) + 1) % 1) * w;
      const y = ((((p.fy + (p.vy * now) / h) % 1) + 1) % 1) * h;
      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.arc(x, y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },
};
