// Grid Pulse — perspective data-grid with travelling pulses. Migrated verbatim
// from the old if/else in CanvasThemes.draw().

export default {
  id: "gridpulse",
  label: "Grid Pulse",
  desc: "Perspective data-grid with traveling pulses",

  init() {
    return {};
  },

  draw({ ctx, w, h, now, rgba }) {
    const horizon = h * 0.42;

    ctx.strokeStyle = rgba(0.34);
    ctx.lineWidth = 1;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, x = w / 2 + (t - 0.5) * w * 2.2;
      ctx.beginPath();
      ctx.moveTo(w / 2 + (t - 0.5) * w * 0.5, horizon);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    for (let i = 0; i < 14; i++) {
      const t = ((now / 2600) + i / 14) % 1;
      const y = horizon + Math.pow(t, 2.2) * (h - horizon);
      ctx.globalAlpha = 0.7 * t + 0.08;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (let i = 0; i < 4; i++) {
      const t = ((now / 1900) + i * 0.27) % 1;
      const lane = [0.2, 0.4, 0.6, 0.8][i];
      const x = w / 2 + (lane - 0.5) * w * (0.5 + 1.7 * Math.pow(t, 2.2));
      const y = horizon + Math.pow(t, 2.2) * (h - horizon);
      ctx.fillStyle = rgba(0.9 * (1 - t) + 0.1);
      ctx.beginPath();
      ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
  },
};
