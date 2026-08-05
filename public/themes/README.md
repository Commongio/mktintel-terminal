# public/themes

Empty on purpose.

Video backdrops were removed — 12MB of MP4 shipped from origin on any page load
that selected one — and are being replaced with themes of our own.

The machinery that rendered them is intact rather than deleted.
`lib/videoThemes.js` still exports `isVideoTheme`, `videoThemeSrc`,
`AVAILABLE_VIDEO_THEMES` and the rest, all correct against an empty registry,
and `ThemeBackdrop` still knows how to play a video. Deleting those exports
would have meant editing four files to remove an import that already degrades
cleanly.

## Bringing a video back

1. Drop `<id>.mp4` here.
2. Add one row to `VIDEO_THEMES` in `lib/videoThemes.js`.

It appears in Settings automatically. The encoding guidance in that file's
header is worth following — under 8MB, audio stripped, seamless loop, dark and
low-motion. These ship to every user on first paint.

## Building the replacements

Custom themes belong in `ThemeBackdrop.jsx` as canvas renderers, alongside
`aurora` and `gridpulse`. That is the better home:

- nothing goes over the wire, so no first-paint cost
- no video decode running behind the whole terminal
- they receive the accent colour as a parameter, so a theme tints *with* the
  rest of the UI instead of fighting it
- they can react to state — the existing ones already take `accent`, and
  nothing stops a theme responding to VIX or session

A video can do none of that. It is a rectangle of someone else's footage.

## If a saved theme points at something missing

Nothing breaks. `migrateTheme()` in `app/page.js` resolves every persisted id
against `THEME_LIST` and falls back to `aurora` when it does not resolve — the
black-screen guard it was written for.

The eight retired ids are also listed explicitly in `RETIRED_THEMES`, so the
record says they were **removed** rather than that an asset went missing. Those
two states look identical to the resolver and mean opposite things.
