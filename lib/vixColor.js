// lib/vixColor.js — shared VIX → color/label mapping.
// No rendering dependency (used by both the 2D fallback and the 3D scene).
export const VIX_STOPS = [
  { v: 10, a: [34, 211, 238], b: [59, 130, 246] },     // teal → blue (calm)
  { v: 17.5, a: [167, 139, 250], b: [226, 232, 240] }, // violet → white (normal)
  { v: 25, a: [245, 158, 11], b: [251, 146, 60] },     // amber → orange (elevated)
  { v: 35, a: [239, 68, 68], b: [244, 63, 94] },       // red (fear)
];
export function lerp(a, b, t) { return a + (b - a) * t; }
export function vixColors(vix) {
  const s = VIX_STOPS;
  if (vix <= s[0].v) return { a: s[0].a, b: s[0].b };
  if (vix >= s[s.length - 1].v) return { a: s[s.length - 1].a, b: s[s.length - 1].b };
  for (let i = 0; i < s.length - 1; i++) {
    if (vix >= s[i].v && vix <= s[i + 1].v) {
      const t = (vix - s[i].v) / (s[i + 1].v - s[i].v);
      return {
        a: s[i].a.map((c, k) => lerp(c, s[i + 1].a[k], t)),
        b: s[i].b.map((c, k) => lerp(c, s[i + 1].b[k], t)),
      };
    }
  }
  return { a: s[1].a, b: s[1].b };
}
export const rgba = (c, al) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al})`;
export const vixLabel = (v) => (v == null ? "—" : v < 15 ? "CALM" : v < 20 ? "NORMAL" : v < 30 ? "ELEVATED" : "FEAR");
// Same rotation-speed / turbulence formulas the 2D orb used — kept identical
// so the swap is purely visual, not a logic change.
export const vixRotationSpeed = (v) => 0.05 + Math.max(0, v - 10) * 0.016;
export const vixTurbulence = (v) => Math.max(0, v - 20) * 0.012;

// ── CSS-filter color control for media we didn't author ───────────────────────
// Used to tint pre-rendered footage (theme videos, the orb video) that we can't
// recolor at the source. A CSS filter (hue-rotate + saturate + brightness) over
// the whole element is the one color lever available. VIX drives it: calm ≈
// untouched (teal), fear ≈ rotated toward red. hueOffset (deg, from the user's
// Theme Color picker) stacks on top so users can recolor it themselves.
//
// (Named splineFilter before V10.4 — Spline is gone; the mechanism is identical.)
export function vixHueRotate(v) {
  // Assumes footage sits around cyan/purple. Map VIX 10→35 to 0→ -140deg so it
  // walks teal → violet → amber → red as volatility rises.
  const clamped = Math.max(10, Math.min(35, v ?? 18));
  const t = (clamped - 10) / 25; // 0..1
  return -t * 140;
}
export function vixFilter(v, hueOffset = 0, saturate = 1, brightness = 1) {
  const hue = vixHueRotate(v) + (hueOffset || 0);
  return `hue-rotate(${hue.toFixed(0)}deg) saturate(${saturate}) brightness(${brightness})`;
}
