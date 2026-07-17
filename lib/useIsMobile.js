"use client";
// lib/useIsMobile.js — V11 single mobile breakpoint.
//
// SSR-SAFETY IS THE WHOLE POINT: this must return `false` on the server AND on
// the client's first render, then flip after mount. Reading matchMedia during
// render would make the server HTML (always desktop) disagree with the client's
// first paint on a phone, and React would throw a hydration mismatch on exactly
// the users this feature exists for. So: mount-then-measure, always.
//
// One breakpoint, deliberately. 768+ gets the desktop layout, which already
// works on tablets — tablet-specific layout is explicitly out of scope
// (PLAN_MOBILE_FUTURE.md), and every extra breakpoint is a permanent tax on
// every future layout change.
import { useState, useEffect } from "react";

export const MOBILE_QUERY = "(max-width: 767px)";

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const apply = () => setIsMobile(mq.matches);
    apply();
    // addEventListener isn't available on MediaQueryList in older Safari; the
    // deprecated addListener is. Phones are exactly where that still bites.
    if (mq.addEventListener) {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, []);

  return isMobile;
}

// True once mounted on the client. Used to hold back mobile-only chrome until
// we actually know the viewport, instead of flashing the wrong layout.
export function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}
