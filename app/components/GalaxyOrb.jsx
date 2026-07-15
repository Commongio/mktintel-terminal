"use client";
// GalaxyOrb.jsx — V10.4 VIX-reactive orb + comet signal launches.
//
// Spline was REMOVED in V10.4 (attribution badge on the free plan, heavy 3D
// runtime, third-party CDN we didn't control). The orb now renders, in order:
//
//   1. ORB_VIDEO (lib/videoThemes) — a looping royalty-free clip we own, radial-
//      masked and VIX-tinted. This is the intended look.
//   2. SpiralOrb — a hand-coded ANIMATED canvas galaxy, used when no orb video is
//      installed (or the video fails). Deliberately animated, not a static
//      gradient: a flat blob was rejected before and the bot must never look dead
//      just because an asset is missing.
//
// The reactive LOGIC is unchanged and lives entirely in OUR code:
//   - VIX color: calm ≈ teal, fear ≈ red.
//   - Signal cues (three-tier), drawn on a canvas overlay we fully control:
//       <78% conviction  → nothing (lands silently in feed)
//       78–90%           → ring pulse + brightness flash on the orb
//       ≥90%             → comet launch from orb to the signal feed (CometLayer)
//
// The orb is a deliberately-chosen visual, so it renders regardless of the OS
// "reduce motion" setting.

import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { vixColors, vixLabel, rgba, vixFilter } from "../../lib/vixColor";
import { orbVideoSrc } from "../../lib/videoThemes";
import VideoBackdrop from "./VideoBackdrop";

export { vixLabel };

// ── STARFIELD ─────────────────────────────────────────────────────────────────
// Fills the whole bot centre panel behind the orb: slow-drifting, twinkling stars
// so the galaxy sits in space instead of floating on a flat panel. Rendered as its
// own full-bleed canvas (absolute inset:0) rather than inside the orb's box, so the
// stars extend past the galaxy edge.
export function Starfield({ density = 1, T }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    let w = 0, h = 0, stars = [];

    const build = () => {
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Scale count with panel area. ~1 star per 2000px² reads as a real starfield;
      // much sparser and it just looks like dust specks.
      const N = Math.round((w * h) / 2000 * density);
      stars = Array.from({ length: N }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.25 + 0.25,
        base: Math.random() * 0.5 + 0.18,          // base brightness
        amp: Math.random() * 0.45,                 // twinkle depth
        phase: Math.random() * Math.PI * 2,
        speed: Math.random() * 0.7 + 0.25,         // twinkle rate
        drift: (Math.random() - 0.5) * 0.012,      // very slow horizontal drift
        warm: Math.random() < 0.14,                // a few warm-tinted stars
      }));
    };
    build();
    window.addEventListener("resize", build);

    let raf, running = true;
    const draw = (now) => {
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const tw = s.base + Math.sin(now / 1000 * s.speed + s.phase) * s.amp;
        const a = Math.max(0.04, Math.min(1, tw));
        s.x += s.drift;
        if (s.x < -2) s.x = w + 2; else if (s.x > w + 2) s.x = -2;
        ctx.fillStyle = s.warm ? `rgba(255,225,190,${a})` : `rgba(220,232,255,${a})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
    };

    const loop = (now) => {
      if (!running) return;
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => { running = document.visibilityState !== "hidden"; if (running) raf = requestAnimationFrame(loop); };
    document.addEventListener("visibilitychange", onVis);

    draw(performance.now());            // guaranteed first paint (rAF may be throttled)
    raf = requestAnimationFrame(loop);

    return () => { running = false; cancelAnimationFrame(raf); window.removeEventListener("resize", build); document.removeEventListener("visibilitychange", onVis); };
  }, [density]);

  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} aria-hidden="true" />;
}

// ── animated canvas galaxy — the no-video fallback ────────────────────────────
// A rotating spiral particle disc. Spin rate and colour track the VIX.
function SpiralOrb({ size, vix }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const cx = size / 2, cy = size / 2;
    const R = size * 0.46;

    // Four arms and a much denser point cloud — at 2 arms / 460 points the disc read
    // as a thin wire ring rather than a galaxy. Points are distributed by sqrt(t) so
    // they spread out toward the rim instead of all bunching in the core.
    const ARMS = 4, N = 2200;
    const pts = Array.from({ length: N }, (_, i) => {
      const t = i / N;
      const arm = i % ARMS;
      const r = Math.pow(t, 0.55) * R;
      const theta = t * 4.2 + (arm * Math.PI * 2) / ARMS;
      // Scatter grows toward the rim so the arms fray out instead of staying crisp.
      const spread = 0.10 + t * 0.30;
      return {
        theta: theta + (Math.random() - 0.5) * spread * 2.4,
        rj: r + (Math.random() - 0.5) * R * (0.06 + t * 0.22),
        size: Math.random() * 1.4 + 0.35,
        alpha: (1 - t) * 0.62 + 0.14,
      };
    });

    // A faint halo of loose stars bound to the galaxy, outside the arms.
    const halo = Array.from({ length: 260 }, () => {
      const ang = Math.random() * Math.PI * 2;
      const rr = R * (0.55 + Math.random() * 0.62);
      return { theta: ang, rj: rr, size: Math.random() * 1.1 + 0.25, alpha: Math.random() * 0.30 + 0.05 };
    });

    let raf, running = true, angle = 0, last = performance.now();

    // Paint a frame. Kept separate from the rAF loop so we can render ONE frame
    // synchronously below — otherwise, anywhere requestAnimationFrame is throttled
    // or never fires (background tab, some embedded/headless contexts), the canvas
    // would sit permanently blank and the orb would look dead.
    const SQUASH = 0.58; // disc tilt. 0.42 was too flat — it read as a wire ring.

    const draw = () => {
      const { a, b } = vixColors(vix ?? 18);
      ctx.clearRect(0, 0, size, size);

      // Broad outer glow so the disc sits in light, not on black.
      const glow = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R * 1.05);
      glow.addColorStop(0, rgba(a, 0.10));
      glow.addColorStop(0.6, rgba(b, 0.045));
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.ellipse(cx, cy, R * 1.05, R * 1.05 * SQUASH + R * 0.22, 0, 0, Math.PI * 2); ctx.fill();

      // Loose halo stars orbiting outside the arms.
      for (const p of halo) {
        const th = p.theta + angle * 0.45;
        const x = cx + Math.cos(th) * p.rj;
        const y = cy + Math.sin(th) * p.rj * SQUASH;
        ctx.fillStyle = rgba(b, p.alpha);
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, Math.PI * 2); ctx.fill();
      }

      // Core bloom
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.5);
      core.addColorStop(0, "rgba(255,255,255,0.95)");
      core.addColorStop(0.16, rgba(a, 0.6));
      core.addColorStop(0.5, rgba(b, 0.16));
      core.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2); ctx.fill();

      // Spiral arms — squashed on Y to read as a disc seen at an angle.
      for (const p of pts) {
        const th = p.theta + angle + p.rj / R * 1.15;   // differential rotation
        const x = cx + Math.cos(th) * p.rj;
        const y = cy + Math.sin(th) * p.rj * SQUASH;
        const t = p.rj / R;
        ctx.fillStyle = t < 0.35 ? rgba(a, p.alpha) : rgba(b, p.alpha * 0.75);
        ctx.beginPath(); ctx.arc(x, y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    };

    const loop = (now) => {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // Calmer tape = slower drift; volatility spins it up.
      const speed = 0.055 + Math.min(1, Math.max(0, ((vix ?? 18) - 10) / 25)) * 0.16;
      angle += dt * speed;
      draw();
      raf = requestAnimationFrame(loop);
    };

    const onVis = () => { running = document.visibilityState !== "hidden"; if (running) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    document.addEventListener("visibilitychange", onVis);

    draw();                            // guaranteed first paint
    raf = requestAnimationFrame(loop); // then animate

    return () => { running = false; cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVis); };
  }, [size, vix]);

  return <canvas ref={canvasRef} style={{ width: size, height: size, display: "block" }} />;
}

// ── pulse-cue overlay (78–90% signals) ────────────────────────────────────────
// A transparent canvas sized to the orb that draws an expanding ring + center
// flash when pulse() is called. Idle (no rAF) until a pulse fires, then runs
// until the envelope decays — cheap.
function PulseOverlay({ size, pulseRef, vix }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = size * dpr; canvas.height = size * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const cx = size / 2, cy = size / 2;
    let raf = 0, last = performance.now(), animating = false;

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      let p = pulseRef.current;
      ctx.clearRect(0, 0, size, size);
      if (p > 0) {
        const { a } = vixColors(vix ?? 18);
        const pr = (1 - p) * (size * 0.46);
        ctx.strokeStyle = rgba(a, p * 0.85);
        ctx.lineWidth = 2 + p * 2.5;
        ctx.beginPath(); ctx.ellipse(cx, cy, pr, pr * 0.62, 0, 0, Math.PI * 2); ctx.stroke();
        const fl = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.2 * p + 8);
        fl.addColorStop(0, rgba(a, p * 0.5));
        fl.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = fl;
        ctx.beginPath(); ctx.arc(cx, cy, size * 0.2 * p + 8, 0, Math.PI * 2); ctx.fill();
        pulseRef.current = Math.max(0, p - dt * 0.9);
        raf = requestAnimationFrame(frame);
      } else {
        animating = false; // stop looping when idle
      }
    };
    // Poll cheaply for a pulse trigger; only spin up the animation loop on demand.
    const poll = setInterval(() => {
      if (pulseRef.current > 0 && !animating) { animating = true; last = performance.now(); raf = requestAnimationFrame(frame); }
    }, 120);

    return () => { clearInterval(poll); cancelAnimationFrame(raf); };
  }, [size, pulseRef, vix]);

  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: size, height: size, pointerEvents: "none", zIndex: 2 }} aria-hidden="true" />;
}

// ── main orb ──────────────────────────────────────────────────────────────────
const GalaxyOrb = forwardRef(function GalaxyOrb({ size = 300, vix, T }, ref) {
  const pulseRef = useRef(0);   // 0..1 pulse envelope — read by the overlay
  const [videoFailed, setVideoFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    pulse() { pulseRef.current = 1; },  // 78–90% cue
  }), []);

  const label = `Volatility orb — VIX ${vix ?? "…"} (${vixLabel(vix)})`;
  const src = orbVideoSrc();
  const useVideo = !!src && !videoFailed;
  const { a } = vixColors(vix ?? 18);

  return (
    <div aria-label={label} role="img" style={{ width: size, height: size, position: "relative" }}>
      {/* VIX-reactive bloom UNDER the orb — makes it read as a light source in the
          dashboard instead of a flat sprite. */}
      <div aria-hidden="true" style={{
        position: "absolute", left: "50%", top: "50%", width: size * 1.5, height: size * 1.5,
        transform: "translate(-50%,-50%)", pointerEvents: "none", zIndex: 0,
        background: `radial-gradient(circle, ${rgba(a, 0.16)} 0%, ${rgba(a, 0.05)} 38%, rgba(0,0,0,0) 68%)`,
        transition: "background 1.2s ease",
      }} />

      {useVideo ? (
        /* A video frame is a RECTANGLE — without this radial mask its hard edges
           read as a dark square box sitting on the page. Feather it out. */
        <div style={{
          position: "absolute", inset: 0, zIndex: 1,
          WebkitMaskImage: "radial-gradient(circle, #000 52%, rgba(0,0,0,0.55) 68%, transparent 78%)",
          maskImage: "radial-gradient(circle, #000 52%, rgba(0,0,0,0.55) 68%, transparent 78%)",
        }}>
          <VideoBackdrop src={src} filter={vixFilter(vix)} onError={() => setVideoFailed(true)} />
        </div>
      ) : (
        /* No orb video installed (or it failed) → animated canvas galaxy. */
        <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
          <SpiralOrb size={size} vix={vix} />
        </div>
      )}

      <PulseOverlay size={size} pulseRef={pulseRef} vix={vix} />
    </div>
  );
});
export default GalaxyOrb;

// ── comet overlay (90%+ launches) ─────────────────────────────────────────────
// Unchanged from the 2D version — a full-screen 2D canvas overlay that draws a
// comet trail in screen space from the orb's bounding rect to the feed's.
// Independent of how the orb itself is rendered, so no 3D work needed here.
export const CometLayer = forwardRef(function CometLayer({ T }, ref) {
  const hostRef = useRef(null);
  const activeRef = useRef([]);
  const rafRef = useRef(0);

  const tick = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const canvas = host.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const { width: w, height: h } = canvas;
    ctx.clearRect(0, 0, w, h);
    const now = performance.now();
    activeRef.current = activeRef.current.filter((c) => {
      const t = Math.min(1, (now - c.t0) / c.dur);
      const e = 1 - Math.pow(1 - t, 2.2);
      const lerp2 = (a, b, tt) => a + (b - a) * tt;
      const x = lerp2(c.from.x, c.to.x, e);
      const arc = Math.sin(t * Math.PI) * -60;
      const y = lerp2(c.from.y, c.to.y, e) + arc;
      c.trail.push({ x, y });
      if (c.trail.length > 26) c.trail.shift();
      for (let i = 0; i < c.trail.length; i++) {
        const p = c.trail[i];
        const a = (i / c.trail.length) * 0.7;
        ctx.fillStyle = `rgba(${c.color},${a})`;
        const s = 1 + (i / c.trail.length) * 5;
        ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.fill();
      }
      const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
      g.addColorStop(0, "rgba(255,255,255,0.98)");
      g.addColorStop(0.4, `rgba(${c.color},0.9)`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.font = "700 11px 'JetBrains Mono',monospace";
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.shadowColor = `rgba(${c.color},0.9)`; ctx.shadowBlur = 8;
      ctx.fillText(c.label, x + 16, y - 8);
      ctx.shadowBlur = 0;
      if (t >= 1) { c.onLand?.(); return false; }
      return true;
    });
    if (activeRef.current.length) rafRef.current = requestAnimationFrame(tick);
  }, []);

  useImperativeHandle(ref, () => ({
    launch(fromEl, toEl, signal, onLand) {
      const host = hostRef.current;
      if (!host || !fromEl || !toEl) { onLand?.(); return; }
      const hostRect = host.getBoundingClientRect();
      const canvas = host.querySelector("canvas");
      canvas.width = hostRect.width; canvas.height = hostRect.height;
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      const dir = signal.direction === "SHORT" ? "255,61,87" : "0,230,118";
      activeRef.current.push({
        t0: performance.now(),
        dur: 1400,
        from: { x: fr.left + fr.width / 2 - hostRect.left, y: fr.top + fr.height / 2 - hostRect.top },
        to: { x: tr.left + tr.width / 2 - hostRect.left, y: tr.top + Math.min(80, tr.height / 4) - hostRect.top },
        color: dir,
        label: `${signal.direction} ${signal.symbol} · ${signal.conviction}%`,
        trail: [],
        onLand,
      });
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tick);
    },
  }), [tick]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 60 }}>
      <canvas style={{ width: "100%", height: "100%", display: "block" }} />
    </div>
  );
});

// ── trading session clock (item 12) — unchanged ───────────────────────────────
export function activeSessions(d = new Date()) {
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  const day = d.getUTCDay();
  const weekday = day >= 1 && day <= 5;
  const sess = [];
  if (weekday && mins >= 0 && mins < 9 * 60) sess.push("ASIA");
  if (weekday && mins >= 8 * 60 && mins < 16 * 60 + 30) sess.push("LONDON");
  if (weekday && mins >= 13 * 60 + 30 && mins < 20 * 60) sess.push("NEW YORK");
  if (!sess.length && (weekday || (day === 0 && mins >= 22 * 60))) sess.push("GLOBEX");
  return sess;
}
