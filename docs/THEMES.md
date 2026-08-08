# Building a KRONOS backdrop theme

Everything an implementer needs, written against the actual code in
`app/components/ThemeBackdrop.jsx`. Read that file too — this document explains
the contract and the reasons; the file is the truth.

---

## What a theme is

A theme is a **canvas animation drawn behind the entire terminal**. It is not a
component, not an image, not a video. You add:

1. one row to `BASIC_THEMES` in `ThemeBackdrop.jsx`
2. one `if (theme === "<id>") { ... }` block inside `draw()`

That is the whole surface area. No new files, no imports, no assets.

```js
const BASIC_THEMES = [
  { id: "none",      label: "Classic",    desc: "Clean dot-grid terminal" },
  { id: "aurora",    label: "Aurora",     desc: "Slow aurora ribbons" },
  { id: "gridpulse", label: "Grid Pulse", desc: "Perspective data-grid with traveling pulses" },
  // yours here
];
```

`id` must be lowercase, hyphen-free, and stable forever — it is persisted in
`localStorage` under `kronos_personal`. Renaming an id orphans every user
sitting on it. If you must rename, add the old id to `RETIRED_THEMES` in
`app/page.js`.

---

## The drawing contract

Your block lives inside `draw(now)` in `CanvasThemes`. Available to you:

| | |
|---|---|
| `ctx` | 2D context, already DPR-transformed. Draw in **CSS pixels**, not device pixels. |
| `w`, `h` | Canvas size in CSS pixels. Re-measured on resize; never cache them. |
| `now` | `performance.now()` milliseconds. **The only time source.** |
| `ac(alpha)` | The user's accent colour as `rgba(...)` at the alpha you pass. |

`draw()` is called with a cleared canvas — `ctx.clearRect` already ran. Do not
clear it again, and do not fill it opaque (see *Transparency* below).

### Shader themes (`kind: "webgl"`)

A theme that declares `kind: "webgl"` receives `gl` instead of `ctx` and owns
its own pixels entirely. Reach for this only when the effect genuinely cannot
be done in 2D — `midnight` qualifies because it evaluates 3D noise twice per
*pixel*, roughly 4.6 million evaluations a frame at 1080p. Almost nothing else
does; a particle field is cheaper and more controllable in 2D.

| | |
|---|---|
| `gl` | WebGL context. `alpha:false`, no depth, no antialias. |
| `dpr` | Device-pixel ratio, capped at **1** for shaders. `iResolution` must be `w*dpr, h*dpr` — `gl_FragCoord` is in device pixels. |

Use `./glhost.js` rather than hand-rolling: it compiles, links, builds the
fullscreen triangle and resolves uniform locations once. Four rules, each of
which has already cost a debugging session:

1. **Guard the precision qualifier.** Use the exported `PRECISION` prefix.
   `precision highp float;` on its own fails to *compile* where highp is
   unavailable, rather than degrading — which looks like a black screen.
2. **`destroy` is mandatory, and must not destroy the context.** Delete the
   program and buffer only. Calling `loseContext()` breaks React StrictMode's
   double-invoke: the second mount reuses the same canvas, `getContext` returns
   the dead context, and every compile fails with a *null* info log.
3. **`init` runs once, not per resize.** Only the viewport changes. Re-running
   it recompiles the shader on every frame of a window drag.
4. **Never throw out of `init`.** The host catches it and disables the
   backdrop, but a backdrop must never be able to unmount the terminal.

The wrapper keys the canvas on theme id, which is load-bearing: a canvas that
has handed out a 2D context can never return a WebGL one.

### Animate from `now`, never from a counter

```js
// Correct — position is a function of absolute time
const t = ((now / 2600) + i / 14) % 1;

// Wrong — speed becomes frame-rate dependent
tick += 0.01;
```

A frame counter runs at a different speed on a 60Hz laptop and a 144Hz monitor,
and it drifts after a background-tab pause. `now` is the same on every machine.

### Never mutate state in `draw()`

`draw()` must be a pure function of `(now, w, h, accent)`. Set up any static
data (particle seeds, ribbon offsets) **once**, before the loop, the way
`aurora` builds `ribbons`. Reasons: `draw()` is called once directly for the
first paint and then again from rAF, so anything that mutates would advance
twice; and a resize must not reset the animation.

---

## Hard requirements

### 1. Transparency

The backdrop sits **behind** every panel, and several panels are translucent.
Never paint an opaque full-canvas rectangle. If your theme needs a base tone,
use a low alpha and let the app's background show through.

### 2. Alpha floor: nothing below ~0.30

This is the single most common failure, and there is a comment in the file
about it. Ribbons were once drawn at `0.08` alpha, which peaks around **21/255**
on canvas. Under a slightly tinted panel that rounds to invisible, and the bug
report was *"the themes stopped displaying."*

Aurora now runs at `0.34–0.42`. Match that range. If your theme looks correct
in isolation but vanishes in the app, the alpha is too low — not the colour.

### 3. Legibility beats beauty

Text, charts and numbers sit on top of this. A backdrop that competes is a
failure however good it looks alone:

- **No hard edges or high-frequency detail.** Blur is your friend — aurora uses
  `ctx.filter = "blur(18px)"`. Always reset with `ctx.filter = "none"` after.
- **No bright regions.** Nothing should approach white.
- **Slow.** Full cycles measured in seconds, not milliseconds. Aurora's slowest
  term has a ~5.2s period. Motion in peripheral vision is distracting at a much
  lower threshold than motion you are looking at.
- **No flashing.** Anything strobing above ~3Hz is a seizure risk and will not
  be accepted.

### 4. Use `ac()` for at least one major element

The user picks an accent colour. A theme that ignores it fights the rest of the
UI. Hardcode secondary colours if you need contrast — aurora hardcodes two of
its three ribbons — but the dominant element should be `ac()`.

### 5. Performance

- Budget **under ~3ms per frame** at 1920×1080.
- Aim for **a few hundred** drawing operations per frame, not thousands.
- Keep per-frame allocation near zero. No `new` inside `draw()`, no array
  building, no string concatenation in a hot loop. The garbage collector
  pausing mid-frame is visible as a stutter.
- DPR is already capped at 1.5 — do not raise it.
- `visibilitychange` already pauses the loop on a hidden tab. Do not add your
  own.

---

## What the wrapper handles — do not reimplement

`ThemeBackdrop` and `CanvasThemes` already provide, for free:

- canvas creation, sizing, DPR transform, resize handling
- the rAF loop, plus a **guaranteed first paint** before rAF fires (rAF is
  throttled to zero in some embedded and automation contexts, which previously
  rendered as "the theme doesn't display")
- pause on hidden tab
- full teardown on unmount and on theme change
- `pointerEvents: "none"` and `aria-hidden` — the backdrop is never
  interactive and never announced
- the user's `hue-rotate` / `saturate` / `brightness` filter
- the user's colour tint via `mix-blend-mode: color`

Your block draws. Nothing else.

---

## A worked template

```js
// Set-up, OUTSIDE the loop — runs once per (theme, accent) change.
let motes;
if (theme === "drift") {
  motes = Array.from({ length: 40 }, (_, i) => ({
    seed: i * 137.5,              // deterministic, not Math.random(): a resize
    depth: 0.3 + (i % 7) / 10,    // must not reshuffle the field
  }));
}

// ...inside draw(now):
if (theme === "drift") {
  for (const m of motes) {
    const x = ((now / (40000 * m.depth) + m.seed / 360) % 1.2 - 0.1) * w;
    const y = h * (0.2 + (m.seed % 60) / 100) + Math.sin(now / 7000 + m.seed) * 30;
    ctx.fillStyle = ac(0.34 * m.depth);
    ctx.beginPath();
    ctx.arc(x, y, 1.5 + m.depth * 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
```

Note: `Math.random()` is avoided in set-up. A resize re-runs the effect, and a
randomly seeded field would visibly jump every time the window changes size.

---

## Reviewing a theme

Check every one of these before merging:

- [ ] Appears in Settings → Themes, selects, and persists across a reload
- [ ] Visible **behind a translucent panel**, not just on an empty page
- [ ] Legible: open the Chart tab and read the price axis over it
- [ ] Responds to an accent change
- [ ] Survives a window resize without jumping or restarting
- [ ] Pauses on tab switch (DevTools → Performance, no frames while hidden)
- [ ] Under 3ms/frame at 1080p (DevTools → Performance)
- [ ] No flashing above ~3Hz
- [ ] `draw()` mutates nothing
- [ ] Any `ctx.filter` is reset to `"none"`

---

## Why canvas and not video

Video themes were removed. 12MB of MP4 shipped from origin on any page load
that selected one, and a video cannot take the accent colour, cannot respond to
market state, and costs a decode running behind the whole terminal for as long
as the app is open.

A canvas theme ships zero bytes, receives `accent`, and — since it already gets
`now` — could just as easily respond to VIX or session. Nothing about the
existing hook prevents passing more state in.

`lib/videoThemes.js` still works if a video is ever genuinely the right answer.
See `public/themes/README.md`.
