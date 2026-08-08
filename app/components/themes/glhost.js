// app/components/themes/glhost.js — the WebGL half of the theme host.
//
// Every theme before this one was 2D canvas. A fragment shader cannot be, and
// porting one to 2D is not a matter of effort: the starfield evaluates 3D value
// noise twice per PIXEL, which is roughly 4.6 million noise evaluations a frame
// at 1080p. A GPU does that without noticing. JavaScript would take seconds per
// frame.
//
// So the registry now has two kinds. A theme declares `kind: "webgl"` and gets
// `gl` instead of `ctx`; everything else about the contract is unchanged, and
// the 2D themes did not have to be touched.
//
// ── WHAT THIS FILE OWNS ─────────────────────────────────────────────────────
// Compiling, linking, the fullscreen triangle, uniform lookup, and teardown.
// A shader theme supplies GLSL and a uniform-setter and nothing else, in the
// same spirit as the 2D contract where a theme never creates a canvas.
//
// ── TEARDOWN, AND THE TRAP IN IT ────────────────────────────────────────────
// The 2D themes document destroy() as unnecessary, and for them it is: a
// particle array is plain garbage. GL objects are not -- programs and buffers
// live in the driver, outside the JS heap.
//
// The obvious way to release them is WEBGL_lose_context.loseContext(), and it
// is WRONG here. A canvas is a React element that survives across effect runs:
// React StrictMode invokes every effect twice in development (mount, clean up,
// mount again), so the second run lands on the SAME canvas whose context the
// first cleanup just destroyed. getContext then hands back the dead context
// rather than null, every compile against it fails, and getShaderInfoLog
// returns null -- an error with no message, from a shader that is perfectly
// valid. That is exactly how this presented.
//
// Two rules come out of it, and they have to hold together:
//   * delete the program and buffer, never the context
//   * key the canvas by theme id, so switching themes mounts a NEW element
//
// The second is what actually bounds context count: an unmounted canvas is
// collected with its context. It also fixes a separate one-way door -- a canvas
// that has handed out a 2D context can never return a WebGL one, so without
// the key, switching from any 2D theme to this one would fail permanently.

export const FULLSCREEN_VERT = `attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

// highp is not guaranteed in fragment shaders. It is universal on desktop and
// on any GPU made this decade, but the standard permits its absence and a
// shader that names it unconditionally fails to COMPILE there rather than
// degrading -- which presents as a black screen. The guard costs two lines.
export const PRECISION = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

function compile(gl, src, type) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    // Thrown with the log attached rather than swallowed. A shader that fails
    // to compile produces a black rectangle, which is indistinguishable from
    // "the theme is subtle" unless the reason is surfaced.
    throw new Error(`shader compile failed: ${log}`);
  }
  return sh;
}

/**
 * Build a program from a fragment shader source and return everything needed
 * to draw and to tear down.
 *
 * `uniforms` is a list of names; the returned `u` maps each to its location.
 * Locations are resolved ONCE here rather than per frame -- getUniformLocation
 * is a string lookup against the linked program and is not free at 60fps.
 */
export function buildProgram(gl, fragSrc, uniforms = [], vertSrc = FULLSCREEN_VERT) {
  const vs = compile(gl, vertSrc, gl.VERTEX_SHADER);
  const fs = compile(gl, fragSrc, gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    throw new Error(`program link failed: ${log}`);
  }
  // Detached and deleted immediately after linking: the program keeps what it
  // needs, and leaving the shader objects attached keeps their source alive in
  // the driver for the life of the program.
  gl.detachShader(program, vs); gl.deleteShader(vs);
  gl.detachShader(program, fs); gl.deleteShader(fs);

  gl.useProgram(program);

  const u = {};
  for (const name of uniforms) u[name] = gl.getUniformLocation(program, name);

  // A fullscreen program gets its triangle here; anything with its own
  // geometry supplies a different vertex shader and builds its own buffers.
  let buffer = null;
  if (vertSrc === FULLSCREEN_VERT) {
    // ONE oversized triangle, not two triangles forming a quad. It covers the
    // viewport with 3 vertices instead of 6, and -- the part that actually
    // matters -- it has no interior edge. A quad's diagonal seam makes the GPU
    // rasterise the pixels along it twice, in separate 2x2 quads.
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  }

  return { program, buffer, u };
}

/** Upload a static Float32Array attribute and return its buffer. */
export function attribBuffer(gl, program, name, data, size) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, name);
  return { buf, loc, size };
}

/** Bind a set of attribute buffers built by attribBuffer. */
export function bindAttribs(gl, attribs) {
  for (const a of attribs) {
    if (a.loc < 0) continue;      // stripped by the compiler as unused
    gl.bindBuffer(gl.ARRAY_BUFFER, a.buf);
    gl.enableVertexAttribArray(a.loc);
    gl.vertexAttribPointer(a.loc, a.size, gl.FLOAT, false, 0, 0);
  }
}

/** Draw the fullscreen triangle. The shader writes every pixel, so no clear. */
export function drawFullscreen(gl, state) {
  if (state?.buffer) {
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffer);
    const loc = gl.getAttribLocation(state.program, "position");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/**
 * Release driver-side objects. Deliberately does NOT call loseContext -- see
 * the note at the top of this file. The context dies with the canvas element,
 * which the host guarantees by keying the canvas on the theme id.
 */
export function teardown(gl, state) {
  if (!gl || !state) return;
  try {
    // DISABLE THE ATTRIBUTE ARRAYS BEFORE DELETING THE BUFFERS THEY POINT AT.
    //
    // Enabled vertex attrib arrays are CONTEXT state, not program state, and
    // they outlive both the program and the buffer. Delete a buffer while an
    // array still references it and the array is left pointing at a dead
    // object; the next draw on that context is INVALID_OPERATION.
    //
    // Which is not hypothetical: React StrictMode remounts on the same canvas,
    // so run two's very first draw inherited run one's enabled arrays pointing
    // at run one's freed buffers. It rendered correctly -- the error does not
    // stop the draw -- and only showed up as a non-zero gl.getError().
    const max = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) || 16;
    for (let i = 0; i < max; i++) gl.disableVertexAttribArray(i);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.useProgram(null);

    // Accepts either shape: a single program/buffer, or the arrays a
    // multi-pass theme collects.
    for (const b of state.buffers || (state.buffer ? [state.buffer] : [])) if (b) gl.deleteBuffer(b);
    for (const p of state.programs || (state.program ? [state.program] : [])) if (p) gl.deleteProgram(p);
  } catch { /* context may already be lost; nothing left to release */ }
}

/** Accent hex -> normalized rgb, for passing a colour into a shader. */
export function accentRgb(hex) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
