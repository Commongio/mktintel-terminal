"use client";
// VideoBackdrop.jsx — looping video layer. Replaces SplineEmbed (V10.4).
//
// autoPlay + muted + playsInline + loop is the exact combination browsers require
// to autoplay without a user gesture. Drop `muted` and it silently refuses to play
// on every modern browser — don't "clean that up".
//
// preload="auto" because this is the page's backdrop: a late-starting or stuttering
// background reads as jank, unlike a video the user chose to press play on.
import { useRef, useEffect, useState } from "react";

export default function VideoBackdrop({
  src,
  filter = "none",
  dim = 0,          // 0..1 dark overlay, for text readability over busy footage
  fadeMs = 700,
  onError,
  style,
}) {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Pause while the tab is hidden — decoding video offscreen burns battery/CPU
  // for something nobody can see.
  useEffect(() => {
    const onVis = () => {
      const v = ref.current;
      if (!v) return;
      if (document.visibilityState === "hidden") v.pause();
      else v.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (!src || failed) return null;

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", ...style }} aria-hidden="true">
      <video
        ref={ref}
        src={src}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onCanPlay={() => setReady(true)}
        onError={() => { setFailed(true); onError?.(); }}
        style={{
          width: "100%", height: "100%", objectFit: "cover", display: "block",
          filter,
          opacity: ready ? 1 : 0,
          transition: `opacity ${fadeMs}ms ease, filter 0.8s ease`,
        }}
      />
      {dim > 0 && (
        <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${dim})`, pointerEvents: "none" }} />
      )}
    </div>
  );
}
