// Kronos Midnight — a GPU starfield.
//
// Same name and same id as before; the implementation is entirely new. This is
// the supplied fragment shader, kept faithful to what it actually does, with
// the adaptations below stated rather than slipped in.
//
// ── WHY THIS IS THE FIRST WEBGL THEME ───────────────────────────────────────
// The shader evaluates 3D value noise TWICE per pixel, and each evaluation is
// eight hash() calls of three dot products and a sin. At 1080p that is roughly
// 4.6 million noise evaluations per frame. A GPU runs it without noticing;
// JavaScript would take seconds a frame. There is no 2D port of this -- the
// host grew a `kind: "webgl"` path instead. See ./glhost.js.
//
// ── WHAT THE SHADER DOES ────────────────────────────────────────────────────
//
//   direction = normalize(vec3(uv * 2 - 1, 1))
//
// Every pixel is a RAY out of a virtual eye, not a point on a flat plane. That
// is why the stars are not a uniform grid: sampling noise along a projected
// direction spreads the field toward the edges exactly like a real wide-angle
// view. It is the single line that makes it read as sky rather than confetti.
//
//   stars = pow(clamp(noise(dir * 200), 0, 1), 8) * 200
//
// The eighth power is the whole trick. Value noise is a smooth blur; raising it
// to a high power crushes everything below the peaks to zero and leaves only
// isolated bright points. Then multiplying by 200 pushes those survivors past
// 1.0 so they clip to white with a soft skirt. Dropping the exponent gives fog;
// dropping the exposure gives grey mush. The pair is what makes stars.
//
//   stars *= mix(0.4, 1.4, noise(dir * 100 + iTime))
//
// The twinkle, and note iTime is added to ALL THREE noise axes -- the modulation
// field DRIFTS diagonally through noise space rather than pulsing in place, so
// stars brighten and dim in slow travelling waves instead of blinking together.
//
// ── THE THREE ADAPTATIONS ───────────────────────────────────────────────────
//
//   1. A BASE COLOUR. The original outputs stars on pure black. Every other
//      theme here sits on a near-black to deep-navy ramp, and Midnight's own
//      was #030507 -> #08131D. That ramp is kept, so the theme still belongs to
//      the family and panels do not sit on a flat #000 rectangle.
//
//   2. THE ACCENT. Stars are white at their cores and take the user's accent in
//      their skirts, which is how real stars photograph and how every other
//      theme handles colour. A fixed white starfield would be the only theme
//      that ignores the accent setting.
//
//   3. SLOWER TWINKLE. iTime is scaled to 0.12. At 1.0 the field visibly boils,
//      which breaks the family rule about motion behind a chart. The drift is
//      still there, just at a speed you notice only if you look for it.
//
// Everything else -- the hash constants, the noise construction, the 200/8/200
// triple, the 0.4-1.4 modulation range -- is exactly as supplied.

import { PRECISION, buildProgram, drawFullscreen, teardown, accentRgb } from "./glhost.js";

const FRAG = PRECISION + `
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 uAccent;

vec3 hash( vec3 p ) {
  p = vec3( dot(p,vec3(127.1,311.7, 74.7)),
            dot(p,vec3(269.5,183.3,246.1)),
            dot(p,vec3(113.5,271.9,124.6)));
  return -1.0 + 2.0*fract(sin(p)*43758.5453123);
}

float noise( in vec3 p ) {
  vec3 i = floor( p );
  vec3 f = fract( p );
  vec3 u = f*f*(3.0-2.0*f);
  return mix( mix( mix( dot( hash( i + vec3(0.0,0.0,0.0) ), f - vec3(0.0,0.0,0.0) ),
                        dot( hash( i + vec3(1.0,0.0,0.0) ), f - vec3(1.0,0.0,0.0) ), u.x),
                   mix( dot( hash( i + vec3(0.0,1.0,0.0) ), f - vec3(0.0,1.0,0.0) ),
                        dot( hash( i + vec3(1.0,1.0,0.0) ), f - vec3(1.0,1.0,0.0) ), u.x), u.y),
              mix( mix( dot( hash( i + vec3(0.0,0.0,1.0) ), f - vec3(0.0,0.0,1.0) ),
                        dot( hash( i + vec3(1.0,0.0,1.0) ), f - vec3(1.0,0.0,1.0) ), u.x),
                   mix( dot( hash( i + vec3(0.0,1.0,1.0) ), f - vec3(0.0,1.0,1.0) ),
                        dot( hash( i + vec3(1.0,1.0,1.0) ), f - vec3(1.0,1.0,1.0) ), u.x), u.y), u.z );
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;

  // Unchanged from the original: every pixel is a ray, which is what gives the
  // field its natural spread toward the edges.
  vec3 stars_direction = normalize(vec3(uv * 2.0 - 1.0, 1.0));
  float stars_threshold = 8.0;
  float stars_exposure = 200.0;
  float stars = pow(clamp(noise(stars_direction * 200.0), 0.0, 1.0), stars_threshold) * stars_exposure;
  stars *= mix(0.4, 1.4, noise(stars_direction * 100.0 + vec3(iTime)));

  // Adaptation 1: the family's night ramp instead of pure black. uv.y is 0 at
  // the BOTTOM in GL, so the first stop lands there — which puts the navy lift
  // low and the darkest value up top, matching the ramp the 2D Midnight used
  // (#030507 at the top, #08131D at the bottom). Measured: mean luminance 19.1
  // along the bottom row against 5.2 along the top.
  vec3 base = mix(vec3(0.031,0.075,0.114), vec3(0.012,0.020,0.027), uv.y);

  // Adaptation 2: white core, accent skirt. The bright centre of a star clips
  // to white while its dimmer halo carries the hue -- so the accent is legible
  // in the field without the stars themselves looking tinted.
  float core = clamp(stars - 1.0, 0.0, 1.0);
  vec3 tinted = mix(uAccent, vec3(1.0), 0.45);
  vec3 star_rgb = mix(tinted * clamp(stars, 0.0, 1.0), vec3(1.0), core);

  gl_FragColor = vec4(base + star_rgb, 1.0);
}
`;

// Adaptation 3. The original advances iTime by one per second; at that rate the
// field visibly boils, which is exactly what this family forbids behind a chart.
const TIME_SCALE = 0.12;

export default {
  id: "midnight",
  label: "Kronos Midnight",
  desc: "A drifting field of stars",
  kind: "webgl",

  init({ gl, accent }) {
    const { program, buffer, u } = buildProgram(gl, FRAG, ["iResolution", "iTime", "uAccent"]);
    gl.uniform3fv(u.uAccent, accentRgb(accent));
    return { program, buffer, u };
  },

  draw({ gl, w, h, now, state, dpr = 1 }) {
    // Resolution in DEVICE pixels: gl_FragCoord is in device pixels too, and
    // passing CSS pixels here would scale uv past 1.0 and squash the field into
    // a corner on any non-1x display.
    gl.uniform2f(state.u.iResolution, w * dpr, h * dpr);
    gl.uniform1f(state.u.iTime, (now / 1000) * TIME_SCALE);
    drawFullscreen(gl);
  },

  destroy(state, gl) { teardown(gl, state); },
};

export { FRAG as _FRAG, TIME_SCALE as _TIME_SCALE };
