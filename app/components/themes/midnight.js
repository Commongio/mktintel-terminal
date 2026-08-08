// Kronos Midnight — flying through a spiral galaxy.
//
// Same name and same id; the implementation is the supplied Three.js scene,
// rebuilt on raw WebGL. Three.js could not come in -- it is a CDN script tag in
// the original and ~600KB as a dependency, for a backdrop -- but the scene is
// only a particle tunnel plus a glowing core, and both are a few dozen lines
// once you are talking to the GPU directly.
//
// ── THE SCENE, AND WHICH PARTS CARRY IT ─────────────────────────────────────
//
// 5000 points seeded into three spiral arms, spread through 200 units of depth,
// travelling toward a camera sitting at the origin and wrapping when they pass
// it. Two lines do the real work:
//
//   const angle = (arm/arms)*PI*2 + random()*0.5;
//   const x = (radius+spread)*cos(angle + radius*0.2);
//                                         ^^^^^^^^^^
// That `radius*0.2` is the entire spiral. Without it the arms are three
// straight spokes; with it, each arm's angle advances with distance from the
// centre, which is exactly how a real spiral arm winds. It is one term and it
// is the difference between a galaxy and a pinwheel.
//
// The other is the two-population colouring -- 10% warm, 90% cool. A field of
// one hue reads as noise; the sparse warm minority is what makes it read as
// stars of different ages. Kept exactly, with the palette moved onto the
// accent (see below).
//
// ── FOUR THINGS CHANGED, AND WHY ────────────────────────────────────────────
//
// 1. MOTION MOVED TO THE GPU. The original rewrites all 5000 z-coordinates in
//    JavaScript every frame and re-uploads the buffer. Here the seed positions
//    are uploaded ONCE and the vertex shader computes z from uTime. That is
//    not only cheaper -- it makes draw() a pure function of `now`, which this
//    registry requires, and it means the animation is identical at 60Hz and
//    144Hz instead of drifting with frame rate.
//
// 2. THE HALO AND RINGS ARE A CORE GLOW. In the original these are
//    RingGeometry meshes rotated flat (rotation.x = PI/2) and placed at z = 0
//    -- the same point as the camera. A horizontal ring containing the camera
//    is seen exactly edge-on, so it renders as a thin bright bar across the
//    middle of the screen with its near half behind the near plane. That is
//    what the code does, and it is plainly not what it is for. Rebuilt as what
//    the scene wants there: a soft pulsing glow at the vanishing point, using
//    the halo's own 0.3 + 0.07*sin(t*1.5) pulse.
//
// 3. PARTICLES FADE AT BOTH ENDS. The original pops them in at z = -200 and
//    clips them at the near plane. A fade over the last stretch costs one
//    smoothstep and removes the flicker at the edges of the tunnel.
//
// 4. THE PALETTE IS THE ACCENT. The original is fixed cyan with orange
//    highlights, a red halo and rainbow rings -- more colour than anything
//    else in this family carries. The 90/10 split is kept exactly; the cool
//    majority is the user's accent and the warm minority a single amber.

import {
  PRECISION, buildProgram, drawFullscreen, teardown, accentRgb,
  attribBuffer, bindAttribs,
} from "./glhost.js";
import { hashRandom } from "./registry.js";

const COUNT = 5000;         // as supplied
const DEPTH = 200.0;        // tunnelDepth
const ARMS = 3;
const SPEED = 0.9;          // world units per second along +z
const FOV = 75 * Math.PI / 180;

// ── the tunnel ──────────────────────────────────────────────────────────────
const POINT_VERT = `
attribute vec3 aSeed;      // x, y, and the starting z
attribute vec3 aColor;
uniform float uTime;
uniform vec2 uRes;
varying vec3 vColor;
varying float vFade;

void main() {
  // The whole animation. mod() wraps a particle back to the far end the
  // instant it passes the camera, so nothing is stored and nothing is
  // re-uploaded -- the position is a function of time alone.
  float z = mod(aSeed.z + uTime * ${SPEED.toFixed(3)}, ${DEPTH.toFixed(1)});
  // Held off the camera plane. At z = 0 the perspective divide is a division
  // by zero and the point explodes across the screen.
  float d = max(z, 0.35);

  float f = 1.0 / tan(${(FOV / 2).toFixed(5)});
  float aspect = uRes.x / max(uRes.y, 1.0);
  gl_Position = vec4(vec2(aSeed.x / aspect, aSeed.y) * f / d, 0.0, 1.0);

  // Size falls off with distance, exactly as three.js sizeAttenuation does.
  // Clamped at both ends: below 1px a point flickers as it crosses the pixel
  // grid, and drivers cap point size anyway (often at 64).
  gl_PointSize = clamp(${'0.9'} * uRes.y * 0.045 / d, 1.0, 22.0);

  // Change 3: fade in from the far plane and out as it sweeps past, so the
  // tunnel has no hard edges at either end.
  vFade = smoothstep(${DEPTH.toFixed(1)}, ${(DEPTH * 0.72).toFixed(1)}, z)
        * smoothstep(0.35, 6.0, z);
  vColor = aColor;
}`;

const POINT_FRAG = PRECISION + `
varying vec3 vColor;
varying float vFade;
void main() {
  // The original builds a 32px circle on a 2D canvas and uploads it as a
  // texture. gl_PointCoord gives the same disc for free, with no texture, no
  // upload and no filtering artefacts at small sizes.
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;             // 0 at centre, 1 at the rim
  if (r > 1.0) discard;
  float a = (1.0 - r) * (1.0 - r);       // soft-edged, brightest at the core
  gl_FragColor = vec4(vColor, a * vFade * 0.7);
}`;

// ── background and core glow ────────────────────────────────────────────────
const BG_FRAG = PRECISION + `
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uAccent;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uv - 0.5) * vec2(uRes.x / max(uRes.y, 1.0), 1.0);
  float d = length(p);

  // The family's night ramp; uv.y is 0 at the bottom in GL, so the navy lift
  // sits low and the darkest value is up top.
  vec3 col = mix(vec3(0.028,0.062,0.094), vec3(0.008,0.014,0.021), uv.y);

  // Change 2: the halo and the three rings, rebuilt as the glow they were
  // trying to be. The pulse is the original's own 0.3 + 0.07*sin(t*1.5).
  float pulse = 0.30 + 0.07 * sin(uTime * 1.5);
  col += uAccent * pulse * 0.42 * exp(-d * 5.2);
  col += vec3(1.0) * pulse * 0.14 * exp(-d * 15.0);
  gl_FragColor = vec4(col, 1.0);
}`;

export default {
  id: "midnight",
  label: "Kronos Midnight",
  desc: "Flying through a spiral galaxy",
  kind: "webgl",

  init({ gl, accent }) {
    const seeds = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const [ar, ag, ab] = accentRgb(accent);

    for (let i = 0; i < COUNT; i++) {
      const arm = i % ARMS;
      // hashRandom, not Math.random: init re-runs when the accent changes, and
      // a random field would reshuffle the whole galaxy rather than re-tint it.
      const angle = (arm / ARMS) * Math.PI * 2 + hashRandom(i, 1) * 0.5;
      const radius = 2 + hashRandom(i, 2) * 20;
      const height = (hashRandom(i, 3) - 0.5) * 2;
      const spread = hashRandom(i, 4) * 0.5;

      // radius * 0.2 is the spiral. See the note at the top of the file.
      seeds[i * 3] = (radius + spread) * Math.cos(angle + radius * 0.2);
      seeds[i * 3 + 1] = height + spread * Math.sin(angle * 3);
      seeds[i * 3 + 2] = hashRandom(i, 5) * DEPTH;

      // The 90/10 split, kept. Warm minority first.
      const warm = hashRandom(i, 6) < 0.1;
      const v = 0.72 + hashRandom(i, 7) * 0.55;
      if (warm) {
        colors[i * 3] = 1.0 * v; colors[i * 3 + 1] = 0.62 * v; colors[i * 3 + 2] = 0.30 * v;
      } else {
        // Accent lifted toward white so the field does not read as one flat
        // wash of a single hue.
        colors[i * 3] = (ar * 0.7 + 0.3) * v;
        colors[i * 3 + 1] = (ag * 0.7 + 0.3) * v;
        colors[i * 3 + 2] = (ab * 0.7 + 0.34) * v;
      }
    }

    const bg = buildProgram(gl, BG_FRAG, ["uRes", "uTime", "uAccent"]);
    gl.uniform3fv(bg.u.uAccent, [ar, ag, ab]);

    const pts = buildProgram(gl, POINT_FRAG, ["uTime", "uRes"], POINT_VERT);
    const attribs = [
      attribBuffer(gl, pts.program, "aSeed", seeds, 3),
      attribBuffer(gl, pts.program, "aColor", colors, 3),
    ];

    // Additive, and depth testing off. Both are required: additive blending is
    // what makes overlapping particles sum into the bright core instead of
    // averaging to grey, and it is order-independent, so a depth buffer would
    // only reject fragments that should have been added.
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    return {
      bg, pts, attribs,
      programs: [bg.program, pts.program],
      buffers: [bg.buffer, ...attribs.map((a) => a.buf)],
    };
  },

  draw({ gl, w, h, now, state, dpr = 1 }) {
    const rw = w * dpr, rh = h * dpr;
    const t = now / 1000;

    // Background pass. Opaque, and it writes every pixel, so it doubles as the
    // clear -- blending is disabled for it and re-enabled for the points.
    gl.disable(gl.BLEND);
    gl.useProgram(state.bg.program);
    gl.uniform2f(state.bg.u.uRes, rw, rh);
    gl.uniform1f(state.bg.u.uTime, t);
    drawFullscreen(gl, state.bg);

    // Tunnel pass.
    gl.enable(gl.BLEND);
    gl.useProgram(state.pts.program);
    gl.uniform2f(state.pts.u.uRes, rw, rh);
    gl.uniform1f(state.pts.u.uTime, t);
    bindAttribs(gl, state.attribs);
    gl.drawArrays(gl.POINTS, 0, COUNT);
  },

  destroy(state, gl) { teardown(gl, state); },
};

export { POINT_VERT as _VERT, POINT_FRAG as _FRAG, BG_FRAG as _BG_FRAG };
export const _SHADERS = [POINT_VERT, POINT_FRAG, BG_FRAG];
