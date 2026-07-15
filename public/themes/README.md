# Theme videos

Drop looping background videos here, then register them in `lib/videoThemes.js`
(one row each — set `file:` to the filename). A theme with no file is hidden from
the picker, so it can never render as a black screen.

## Naming
`public/themes/<id>.mp4`  — e.g. `galaxy.mp4`, `orb.mp4`, `earth.mp4`

## Encoding (do this — these ship to every user)
Keep each file under ~8MB. Backgrounds load on every page view that selects them.

    ffmpeg -i input.mp4 -t 12 -an -vf "scale=1920:-2,fps=24" \
           -c:v libx264 -crf 30 -preset slow -movflags +faststart galaxy.mp4

- `-an`   strip audio. Required: browsers refuse to autoplay video with sound,
          and a background must be silent anyway.
- `-t 12` ~10-20s is plenty.
- Make it loop SEAMLESSLY (first frame ≈ last frame) or users see a jump each cycle.
- Prefer dark, low-contrast, low-motion footage — terminal text sits on top of it.

## Orb
To use a video for the Kronos bot orb, add the file here and set `ORB_VIDEO` in
`lib/videoThemes.js`. Without it, the orb uses the animated canvas galaxy.
