// Aurora — slow ribbons. Migrated verbatim from the old if/else in
// CanvasThemes.draw(), including its alpha values.
//
// Those alphas are the reason the theme spec has a floor. They shipped at
// 0.08-0.10, peaked around 21/255 on canvas, and vanished under a tinted
// panel -- reported as "the themes stopped displaying". They are 0.34-0.42
// now. Do not lower them.

export default {
  id: "aurora",
  label: "Aurora",
  desc: "Slow aurora ribbons",

  init() {
    return { ribbons: Array.from({ length: 3 }, (_, i) => ({ off: i * 2.1, hue: i })) };
  },

  draw({ ctx, w, h, now, state, rgba }) {
    for (const r0 of state.ribbons) {
      ctx.beginPath();
      for (let x = 0; x <= w; x += 14) {
        const y = h * (0.25 + r0.hue * 0.22)
          + Math.sin(x / 190 + now / (5200 + r0.hue * 900) + r0.off) * 60
          + Math.sin(x / 67 + now / 3400) * 22;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      const cols = [rgba(0.42), "rgba(127,169,216,0.36)", "rgba(160,153,224,0.34)"];
      ctx.strokeStyle = cols[r0.hue % 3];
      ctx.lineWidth = 46;
      ctx.lineCap = "round";
      ctx.filter = "blur(18px)";
      ctx.stroke();
      ctx.filter = "none";
    }
  },
};
